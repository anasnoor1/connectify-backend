const mongoose = require("mongoose");
const Proposal = require("../model/Proposal");
const Campaign = require("../model/Campaign");

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
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      return res.status(400).json({ msg: "Cannot send proposals to a completed or cancelled campaign" });
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

    // Find the proposal
    const proposal = await Proposal.findById(proposalId).populate('campaignId');

    if (!proposal) {
      return res.status(404).json({ msg: "Proposal not found" });
    }

    // Verify the campaign belongs to this brand
    if (proposal.campaignId.brand_id.toString() !== brandId.toString()) {
      return res.status(403).json({ msg: "You don't have permission to update this proposal" });
    }

    // Update the proposal status
    proposal.status = status;
    await proposal.save();

    res.status(200).json({
      msg: `Proposal ${status} successfully`,
      data: {
        proposal: proposal
      },
    });
  } catch (error) {
    console.error("Update Proposal Status Error:", error);
    res.status(500).json({ msg: "Server error while updating proposal" });
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
