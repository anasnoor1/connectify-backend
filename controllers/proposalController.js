const mongoose = require("mongoose");
const Proposal = require("../model/Proposal");
const Campaign = require("../model/Campaign");
const Transaction = require("../model/Transaction");
const Stripe = require("stripe");
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeSecretKey ? Stripe(stripeSecretKey) : null;
const STRIPE_CURRENCY = process.env.STRIPE_CURRENCY || "usd";
const APP_FEE_PERCENT = 0.10;

// Helper function to parse delivery time to days
function parseDeliveryTimeToDays(deliveryTime) {
  const match = deliveryTime.match(/^(\d+)\s*(day|days|week|weeks)$/i);
  if (!match) return null;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === 'day' || unit === 'days') {
    return value;
  } else if (unit === 'week' || unit === 'weeks') {
    return value * 7;
  }
  return null;
}

exports.createProposal = async (req, res) => {
  try {
    const { campaignId, amount, message, deliveryTime } = req.body;

    // Basic field validation
    if (!campaignId || !amount || !message || !deliveryTime) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    // Fetch the campaign to validate budget constraints
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ msg: "Campaign not found" });
    }

    // Do not allow proposals on completed or cancelled campaigns
    if (campaign.status === 'completed' || campaign.status === 'cancelled' || campaign.status === 'disputed') {
      return res.status(400).json({ msg: "Cannot send proposals to a completed, cancelled, or disputed campaign" });
    }

    // Validate proposed amount is within campaign budget range
    const proposedAmount = Number(amount);
    if (isNaN(proposedAmount) || proposedAmount <= 0) {
      return res.status(400).json({ msg: "Amount must be a valid positive number" });
    }

    if (proposedAmount < campaign.budgetMin) {
      return res.status(400).json({
        msg: `Proposed amount must be at least $${campaign.budgetMin} (campaign minimum budget)`
      });
    }

    if (proposedAmount > campaign.budgetMax) {
      return res.status(400).json({
        msg: `Proposed amount cannot exceed $${campaign.budgetMax} (campaign maximum budget)`
      });
    }

    // Validate delivery time format and parse
    const deliveryDays = parseDeliveryTimeToDays(deliveryTime);
    if (deliveryDays === null) {
      return res.status(400).json({
        msg: "Invalid delivery time format. Use format like '7 days' or '2 weeks'"
      });
    }

    // Validate delivery time constraints
    if (deliveryDays < 1) {
      return res.status(400).json({
        msg: "Delivery time must be at least 1 day"
      });
    }

    if (deliveryDays > 90) {
      return res.status(400).json({
        msg: "Delivery time cannot exceed 90 days (3 months or 12 weeks)"
      });
    }

    // Check for duplicate proposal
    const existingProposal = await Proposal.findOne({
      campaignId,
      influencerId: req.user._id,
    });

    if (existingProposal) {
      return res.status(400).json({
        msg: "You have already submitted a proposal for this campaign"
      });
    }

    const proposal = new Proposal({
      campaignId,
      influencerId: req.user._id,
      amount: proposedAmount,
      message,
      deliveryTime,
    });

    await proposal.save();

    res.status(201).json({
      msg: "Proposal created successfully",
      proposal,
    });
  } catch (error) {
    console.error("Proposal Error:", error);
    res.status(500).json({ msg: "Server error while sending proposal" });
  }
};

// Get aggregate stats for the logged-in influencer
exports.getMyStats = async (req, res) => {
  try {
    const influencerId = req.user._id;

    const completedProposals = await Proposal.find({
      influencerId,
      adminApprovedCompletion: true,
    }).select('amount');

    const completedCampaigns = completedProposals.length;
    const totalEarned = completedProposals.reduce((sum, proposal) => {
      const value = typeof proposal.amount === 'number'
        ? proposal.amount
        : Number(proposal.amount) || 0;
      return sum + value;
    }, 0);

    return res.status(200).json({
      success: true,
      data: {
        completedCampaigns,
        totalEarned,
      },
    });
  } catch (error) {
    console.error("Get My Stats Error:", error);
    return res.status(500).json({ success: false, msg: "Server error while fetching influencer stats" });
  }
};

exports.getMyProposals = async (req, res) => {
  try {
    const influencerId = req.user._id;

    const proposals = await Proposal.find({ influencerId })
      .populate({
        path: "campaignId",
        select: "title description category budgetMin budgetMax brand_id status reviewEnabled",
        populate: {
          path: "brand_id",
          select: "name company_name"
        }
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      msg: "Proposals fetched successfully",
      data: {
        proposals: proposals
      },
    });
  } catch (error) {
    console.error("Get My Proposals Error:", error);
    res.status(500).json({ msg: "Server error while fetching proposals" });
  }
};

// Get proposals for brand's campaigns
exports.getBrandProposals = async (req, res) => {
  try {
    const brandId = req.user._id;

    // Find all campaigns by this brand
    const campaigns = await Campaign.find({ brand_id: brandId }).select('_id');
    const campaignIds = campaigns.map(c => c._id);

    // Find all proposals for these campaigns
    const proposals = await Proposal.find({ campaignId: { $in: campaignIds } })
      .populate({
        path: "campaignId",
        select: "title description category budgetMin budgetMax status reviewEnabled"
      })
      .populate({
        path: "influencerId",
        select: "name email"
      })
      .sort({ createdAt: -1 });

    res.status(200).json({
      msg: "Proposals fetched successfully",
      data: {
        proposals: proposals
      },
    });
  } catch (error) {
    console.error("Get Brand Proposals Error:", error);
    res.status(500).json({ msg: "Server error while fetching proposals" });
  }
};

// Update proposal status (accept/reject)
exports.updateProposalStatus = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { status } = req.body;
    const brandId = req.user._id;

    // Validate status
    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ msg: "Invalid status. Must be 'accepted' or 'rejected'" });
    }

    const proposal = await Proposal.findById(proposalId).populate('campaignId');

    if (!proposal) {
      return res.status(404).json({ msg: "Proposal not found" });
    }

    if (proposal.campaignId.brand_id.toString() !== brandId.toString()) {
      return res.status(403).json({ msg: "You don't have permission to update this proposal" });
    }

    let clientSecret = null;

    if (status === "accepted") {
      proposal.status = "accepted";

      // Set acceptance timestamp and compute deadline based on deliveryTime
      const now = new Date();
      if (!proposal.acceptedAt) {
        proposal.acceptedAt = now;
      }
      const deliveryDays = parseDeliveryTimeToDays(proposal.deliveryTime || "");
      if (deliveryDays === null) {
        return res.status(400).json({ msg: "Invalid delivery time on proposal. Cannot calculate deadline." });
      }
      if (!proposal.deadline) {
        proposal.deadline = new Date(proposal.acceptedAt.getTime() + deliveryDays * 24 * 60 * 60 * 1000);
      }

      if (!proposal.paymentIntentId) {
        const amountNumber = typeof proposal.amount === "number" ? proposal.amount : Number(proposal.amount) || 0;
        if (!amountNumber || amountNumber <= 0) {
          return res.status(400).json({ msg: "Invalid proposal amount for payment" });
        }

        if (!stripe || !process.env.STRIPE_SECRET_KEY) {
          return res.status(500).json({ msg: "Stripe is not configured on the server" });
        }

        const amountInMinor = Math.round(amountNumber * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amountInMinor,
          currency: STRIPE_CURRENCY,
          metadata: {
            proposalId: String(proposal._id),
            campaignId: String(proposal.campaignId._id),
            brandId: String(proposal.campaignId.brand_id),
            influencerId: String(proposal.influencerId),
          },
          automatic_payment_methods: { enabled: true },
        });

        const appFee = Number((amountNumber * APP_FEE_PERCENT).toFixed(2));
        const influencerAmount = Number((amountNumber - appFee).toFixed(2));

        const brandUserId = proposal.campaignId.brand_id;

        const tx = await Transaction.create({
          user_id: brandUserId,
          amount: amountNumber,
          transaction_type: "debit",
          status: "pending",
          campaignId: proposal.campaignId._id,
          proposalId: proposal._id,
          stripePaymentIntentId: paymentIntent.id,
          currency: STRIPE_CURRENCY,
          app_fee: appFee,
          influencer_amount: influencerAmount,
          isPayout: false,
          description: `Brand payment for proposal ${proposal._id}`,
        });

        proposal.paymentStatus = "pending";
        proposal.paymentIntentId = paymentIntent.id;
        proposal.brandTransactionId = tx._id;
        clientSecret = paymentIntent.client_secret;
      } else {
        if (!stripe) {
          return res.status(500).json({ msg: "Stripe is not configured on the server" });
        }

        try {
          const existingIntent = await stripe.paymentIntents.retrieve(proposal.paymentIntentId);
          if (existingIntent && existingIntent.client_secret) {
            clientSecret = existingIntent.client_secret;
          }
        } catch (e) {
          console.error("Failed to retrieve existing PaymentIntent:", e);
          return res.status(500).json({ msg: "Failed to retrieve existing payment" });
        }
      }
    } else {
      proposal.status = status;
    }

    await proposal.save();

    res.status(200).json({
      msg: `Proposal ${status} successfully`,
      data: {
        proposal,
        stripe: clientSecret ? { clientSecret } : null,
      },
    });
  } catch (error) {
    console.error("Update Proposal Status Error:", error);
    res.status(500).json({ msg: "Server error while updating proposal" });
  }
};

exports.confirmProposalPayment = async (req, res) => {
  try {
    const { proposalId } = req.params;
    const { paymentIntentId } = req.body;
    const brandId = req.user._id;

    if (!paymentIntentId) {
      return res.status(400).json({ msg: "paymentIntentId is required" });
    }

    const proposal = await Proposal.findById(proposalId).populate("campaignId");

    if (!proposal) {
      return res.status(404).json({ msg: "Proposal not found" });
    }

    if (proposal.campaignId.brand_id.toString() !== brandId.toString()) {
      return res.status(403).json({ msg: "You don't have permission to confirm payment for this proposal" });
    }

    if (proposal.paymentIntentId !== paymentIntentId) {
      return res.status(400).json({ msg: "Payment intent does not match this proposal" });
    }

    if (!stripe || !process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ msg: "Stripe is not configured on the server" });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!paymentIntent || paymentIntent.status !== "succeeded") {
      return res.status(400).json({ msg: "Payment has not succeeded" });
    }

    let tx = null;
    if (proposal.brandTransactionId) {
      tx = await Transaction.findById(proposal.brandTransactionId);
    }
    if (!tx) {
      tx = await Transaction.findOne({ proposalId: proposal._id, stripePaymentIntentId: paymentIntentId });
    }

    if (tx) {
      tx.status = "approved";
      if (paymentIntent.charges && paymentIntent.charges.data && paymentIntent.charges.data.length > 0) {
        tx.stripeChargeId = paymentIntent.charges.data[0].id;
      }
      await tx.save();
    }

    proposal.paymentStatus = "paid";
    await proposal.save();

    return res.status(200).json({
      msg: "Payment confirmed and proposal marked as paid",
      data: {
        proposal,
      },
    });
  } catch (error) {
    console.error("Confirm Proposal Payment Error:", error);
    return res.status(500).json({ msg: "Server error while confirming payment" });
  }
};

// Get all proposals (Admin only)
exports.getAllProposals = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const proposals = await Proposal.find(query)
      .populate({
        path: "campaignId",
        select: "title description category budgetMin budgetMax brand_id",
        populate: {
          path: "brand_id",
          select: "name email"
        }
      })
      .populate({
        path: "influencerId",
        select: "name email"
      })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    const total = await Proposal.countDocuments(query);

    res.status(200).json({
      msg: "All proposals fetched successfully",
      data: {
        proposals: proposals,
        totalPages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        total
      },
    });
  } catch (error) {
    console.error("Get All Proposals Error:", error);
    res.status(500).json({ msg: "Server error while fetching proposals" });
  }
};
