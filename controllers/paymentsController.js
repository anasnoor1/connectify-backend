const Stripe = require("stripe");
const Proposal = require("../model/Proposal");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

exports.createPaymentIntent = async (req, res) => {
  try {
    const { proposalId } = req.body;

    if (!proposalId) {
      return res.status(400).json({ msg: "proposalId is required" });
    }

    const proposal = await Proposal.findById(proposalId).populate("campaignId");
    if (!proposal) {
      return res.status(404).json({ msg: "Proposal not found" });
    }

    if (proposal.status !== "accepted") {
      return res.status(400).json({ msg: "Proposal must be accepted before payment" });
    }

    const amount = Number(proposal.amount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({ msg: "Invalid proposal amount" });
    }

    const brandFeePercent = Number(process.env.PLATFORM_FEE_BRAND_PERCENT || 5);
    const influencerFeePercent = Number(process.env.PLATFORM_FEE_INFLUENCER_PERCENT || 5);

    const brandFee = (amount * brandFeePercent) / 100;
    const influencerFee = (amount * influencerFeePercent) / 100;
    const influencerNet = amount - influencerFee;

    const currency = (process.env.CURRENCY || "usd").toLowerCase();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency,
      metadata: {
        proposalId: String(proposal._id),
        campaignId: String(proposal.campaignId?._id || ""),
      },
    });

    proposal.paymentIntentId = paymentIntent.id;
    proposal.paymentStatus = "unpaid";
    proposal.brandPaidAmount = amount;
    proposal.platformFeeFromBrand = brandFee;
    proposal.platformFeeFromInfluencer = influencerFee;
    proposal.influencerGrossAmount = amount;
    proposal.influencerNetAmount = influencerNet;
    await proposal.save();

    return res.status(200).json({
      msg: "PaymentIntent created",
      data: {
        clientSecret: paymentIntent.client_secret,
        amount,
        currency,
        brandFee,
        influencerFee,
        influencerNet,
      },
    });
  } catch (err) {
    console.error("createPaymentIntent error:", err);
    return res.status(500).json({ msg: "Error creating payment intent" });
  }
};

exports.markPaymentPaid = async (req, res) => {
  try {
    const { proposalId } = req.body;

    if (!proposalId) {
      return res.status(400).json({ msg: "proposalId is required" });
    }

    const proposal = await Proposal.findById(proposalId);
    if (!proposal) {
      return res.status(404).json({ msg: "Proposal not found" });
    }

    if (!proposal.paymentIntentId) {
      return res.status(400).json({ msg: "No payment intent associated with this proposal" });
    }

    proposal.paymentStatus = "paid";
    await proposal.save();

    return res.status(200).json({
      msg: "Payment marked as paid",
      data: { proposalId: proposal._id },
    });
  } catch (err) {
    console.error("markPaymentPaid error:", err);
    return res.status(500).json({ msg: "Error marking payment as paid" });
  }
};

exports.markPayoutReleased = async (req, res) => {
  try {
    const { proposalId } = req.body;

    if (!proposalId) {
      return res.status(400).json({ msg: "proposalId is required" });
    }

    const proposal = await Proposal.findById(proposalId);
    if (!proposal) {
      return res.status(404).json({ msg: "Proposal not found" });
    }

    proposal.paymentStatus = "released";
    proposal.payoutReleasedAt = new Date();
    proposal.adminApprovedCompletion = true;
    proposal.adminCompletionApprovedAt = new Date();
    await proposal.save();

    return res.status(200).json({
      msg: "Payout marked as released",
      data: { proposalId: proposal._id },
    });
  } catch (err) {
    console.error("markPayoutReleased error:", err);
    return res.status(500).json({ msg: "Error marking payout as released" });
  }
};
