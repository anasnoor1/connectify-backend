const Dispute = require("../model/Dispute");
const Campaign = require("../model/Campaign");
const Proposal = require("../model/Proposal");
const User = require("../model/User");

const OPEN_STATUSES = ["pending", "needs_info", "escalated"];

exports.createDispute = async (req, res) => {
  try {
    if (!req.user || (req.user.role !== "brand" && req.user.role !== "influencer")) {
      return res.status(403).json({ success: false, message: "Only brand or influencer can raise a dispute" });
    }

    const { campaignId, reason, description, evidence = [], againstUserId } = req.body;
    if (!campaignId || !description) {
      return res.status(400).json({ success: false, message: "campaignId and description are required" });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    // Prevent duplicate open disputes for the same campaign
    const openExists = await Dispute.exists({ campaignId, status: { $in: OPEN_STATUSES } });
    if (openExists) {
      return res.status(400).json({ success: false, message: "An open dispute already exists for this campaign" });
    }

    // Authorization: brand can dispute its own campaign; influencer needs an accepted proposal on the campaign
    let roleOfRaiser = req.user.role;
    if (roleOfRaiser === "brand") {
      if (String(campaign.brand_id) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: "Not allowed to dispute this campaign" });
      }
    } else if (roleOfRaiser === "influencer") {
      const acceptedProposal = await Proposal.findOne({
        campaignId,
        influencerId: req.user._id,
        status: { $in: ["accepted", "pending", "rejected"] }, // allow even if later rejected to report issues
      });
      if (!acceptedProposal) {
        return res.status(403).json({ success: false, message: "You do not belong to this campaign" });
      }
    }

    // Determine counterparty
    let against = againstUserId;
    if (!againstUserId) {
      if (roleOfRaiser === "brand") {
        // choose first accepted influencer if any
        const anyProposal = await Proposal.findOne({ campaignId, status: "accepted" }).select("influencerId");
        if (anyProposal) against = anyProposal.influencerId;
      } else {
        against = campaign.brand_id;
      }
    }

    const normalizedEvidence = Array.isArray(evidence)
      ? evidence
          .filter((e) => e && (e.url || e.text))
          .map((e) => ({
            type: e.type || (e.url ? "file" : "text"),
            url: e.url,
            text: e.text,
            caption: e.caption,
            uploadedBy: req.user._id,
          }))
      : [];

    const dispute = await Dispute.create({
      campaignId,
      raisedBy: req.user._id,
      against,
      roleOfRaiser,
      reason: reason || "other",
      description,
      evidence: normalizedEvidence,
    });

    // Mark campaign as disputed to halt payouts
    campaign.status = "disputed";
    await campaign.save();

    return res.status(201).json({ success: true, data: dispute });
  } catch (err) {
    console.error("createDispute error:", err);
    return res.status(500).json({ success: false, message: "Failed to create dispute" });
  }
};

exports.getDisputes = async (req, res) => {
  try {
    const { status, campaignId, page = 1, limit = 20 } = req.query;
    const parsedLimit = Math.min(parseInt(limit, 10) || 20, 100);
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);

    const query = {};
    if (status) query.status = status;
    if (campaignId) query.campaignId = campaignId;

    // visibility rules
    if (req.user.role !== "admin") {
      query.$or = [{ raisedBy: req.user._id }, { against: req.user._id }];
    }

    const items = await Dispute.find(query)
      .sort({ createdAt: -1 })
      .skip((parsedPage - 1) * parsedLimit)
      .limit(parsedLimit)
      .populate("campaignId", "title status brand_id")
      .populate("raisedBy", "name role")
      .populate("against", "name role");

    const total = await Dispute.countDocuments(query);
    return res.json({
      success: true,
      data: items,
      meta: { total, totalPages: Math.ceil(total / parsedLimit), currentPage: parsedPage },
    });
  } catch (err) {
    console.error("getDisputes error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch disputes" });
  }
};

exports.getDispute = async (req, res) => {
  try {
    const { id } = req.params;
    const dispute = await Dispute.findById(id)
      .populate("campaignId", "title status brand_id")
      .populate("raisedBy", "name role")
      .populate("against", "name role");

    if (!dispute) return res.status(404).json({ success: false, message: "Dispute not found" });

    if (
      req.user.role !== "admin" &&
      String(dispute.raisedBy?._id || dispute.raisedBy) !== String(req.user._id) &&
      (!dispute.against || String(dispute.against?._id || dispute.against) !== String(req.user._id))
    ) {
      return res.status(403).json({ success: false, message: "Not allowed to view this dispute" });
    }

    return res.json({ success: true, data: dispute });
  } catch (err) {
    console.error("getDispute error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch dispute" });
  }
};

exports.addEvidence = async (req, res) => {
  try {
    const { id } = req.params;
    const { url, text, type, caption } = req.body;

    const dispute = await Dispute.findById(id);
    if (!dispute) return res.status(404).json({ success: false, message: "Dispute not found" });

    if (
      req.user.role !== "admin" &&
      String(dispute.raisedBy) !== String(req.user._id) &&
      String(dispute.against) !== String(req.user._id)
    ) {
      return res.status(403).json({ success: false, message: "Not allowed to add evidence" });
    }

    if (!OPEN_STATUSES.includes(dispute.status)) {
      return res.status(400).json({ success: false, message: "Dispute is closed and cannot accept new evidence" });
    }

    if (!url && !text) {
      return res.status(400).json({ success: false, message: "url or text is required" });
    }

    dispute.evidence.push({
      type: type || (url ? "file" : "text"),
      url,
      text,
      caption,
      uploadedBy: req.user._id,
    });

    await dispute.save();
    return res.json({ success: true, data: dispute });
  } catch (err) {
    console.error("addEvidence error:", err);
    return res.status(500).json({ success: false, message: "Failed to add evidence" });
  }
};

exports.addMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, attachments = [] } = req.body;
    if (!message) return res.status(400).json({ success: false, message: "message is required" });

    const dispute = await Dispute.findById(id);
    if (!dispute) return res.status(404).json({ success: false, message: "Dispute not found" });

    if (
      req.user.role !== "admin" &&
      String(dispute.raisedBy) !== String(req.user._id) &&
      String(dispute.against) !== String(req.user._id)
    ) {
      return res.status(403).json({ success: false, message: "Not allowed to post message" });
    }

    if (!OPEN_STATUSES.includes(dispute.status)) {
      return res.status(400).json({ success: false, message: "Dispute is closed and cannot accept new messages" });
    }

    dispute.messages.push({
      senderId: req.user._id,
      message,
      attachments: Array.isArray(attachments) ? attachments : [],
    });

    await dispute.save();
    return res.json({ success: true, data: dispute });
  } catch (err) {
    console.error("addMessage error:", err);
    return res.status(500).json({ success: false, message: "Failed to add message" });
  }
};

exports.adminDecision = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { id } = req.params;
    const { decision, notes, amount } = req.body;

    // Require amount for refund_partial and release_funds
    if ((decision === "refund_partial" || decision === "release_funds") && (!amount || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: "Amount is required and must be greater than 0 for this decision" });
    }

    const dispute = await Dispute.findById(id).populate("campaignId");
    if (!dispute) return res.status(404).json({ success: false, message: "Dispute not found" });

    // Once a decision is made, it is final and cannot be changed
    if (
      (dispute.status === "resolved" || dispute.status === "rejected") &&
      dispute.resolution &&
      dispute.resolution.decision
    ) {
      return res.status(400).json({ success: false, message: "Admin decision is final and cannot be changed" });
    }

    dispute.status = decision === "reject" ? "rejected" : "resolved";
    dispute.resolution = {
      decisionBy: req.user._id,
      decision,
      notes,
      amount,
      decidedAt: new Date(),
    };

    // Adjust campaign status after resolution
    if (dispute.campaignId) {
      if (decision === "refund_full" || decision === "refund_partial" || decision === "reject") {
        dispute.campaignId.status = "cancelled";
      } else if (decision === "redo_work") {
        // Send campaign back to active so influencer can redo and mark complete again
        dispute.campaignId.status = "active";
        dispute.campaignId.reviewEnabled = false;
        dispute.campaignId.influencerCompleted = false;
        dispute.campaignId.influencerCompletedAt = null;

        // Reset completion flags on proposals for this campaign so the influencer can re-complete
        // Note: brand ids will not match influencerId, so this remains safe.
        const potentialInfluencerIds = [dispute.raisedBy, dispute.against].filter(Boolean);
        await Proposal.updateMany(
          {
            campaignId: dispute.campaignId._id,
            influencerId: { $in: potentialInfluencerIds },
          },
          {
            $set: {
              influencerMarkedComplete: false,
              influencerCompletedAt: null,
              adminApprovedCompletion: false,
              adminCompletionApprovedAt: null,
            },
          }
        );
      } else {
        dispute.campaignId.status = "completed";
      }

      dispute.campaignId.updated_at = new Date();
      await dispute.campaignId.save();
    }

    await dispute.save();
    return res.json({ success: true, data: dispute });
  } catch (err) {
    console.error("adminDecision error:", err);
    return res.status(500).json({ success: false, message: "Failed to update dispute" });
  }
};

// Helper to check blocking payout (used by other controllers)
exports.isCampaignDisputed = async (campaignId) => {
  const exists = await Dispute.exists({ campaignId, status: { $in: OPEN_STATUSES } });
  return !!exists;
};
