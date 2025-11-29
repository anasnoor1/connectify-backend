const Review = require("../model/Review");
const Campaign = require("../model/Campaign");
const Proposal = require("../model/Proposal");
const User = require("../model/User");

// Create a review from the logged-in user (brand or influencer)
// Body: { campaignId, toUserId, rating, comment, proposalId? }
exports.createReview = async (req, res) => {
  try {
    const fromUserId = req.user._id;
    const fromRole = req.user.role;
    const { campaignId, toUserId, rating, comment, proposalId } = req.body;

    if (!campaignId || !toUserId || rating === undefined) {
      return res.status(400).json({
        success: false,
        message: "campaignId, toUserId and rating are required",
      });
    }

    if (!['brand', 'influencer'].includes(fromRole)) {
      return res.status(403).json({
        success: false,
        message: "Only brands and influencers can leave reviews",
      });
    }

    const numericRating = Number(rating);
    if (!Number.isFinite(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a number between 1 and 5",
      });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: "Campaign not found" });
    }

    if (campaign.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: "Reviews are only allowed after the campaign is marked completed by admin",
      });
    }

    if (!campaign.reviewEnabled) {
      return res.status(400).json({
        success: false,
        message: "Reviews are not enabled for this campaign yet",
      });
    }

    const toUser = await User.findById(toUserId).select('role');
    if (!toUser) {
      return res.status(404).json({ success: false, message: "Target user not found" });
    }

    const toRole = toUser.role;

    // Roles must be opposite: one brand, one influencer
    if (!['brand', 'influencer'].includes(toRole) || toRole === fromRole) {
      return res.status(400).json({
        success: false,
        message: "Reviews must be between a brand and an influencer",
      });
    }

    // Validate collaboration relationship via accepted proposal
    let influencerId;
    let brandId;

    if (fromRole === 'brand') {
      brandId = fromUserId;
      influencerId = toUserId;

      if (String(campaign.brand_id) !== String(brandId)) {
        return res.status(403).json({
          success: false,
          message: "You can only review influencers on your own campaigns",
        });
      }
    } else {
      influencerId = fromUserId;
      brandId = toUserId;

      if (String(campaign.brand_id) !== String(brandId)) {
        return res.status(403).json({
          success: false,
          message: "You can only review the brand that owns this campaign",
        });
      }
    }

    const acceptedProposal = await Proposal.findOne({
      campaignId,
      influencerId,
      status: 'accepted',
    });

    if (!acceptedProposal) {
      return res.status(400).json({
        success: false,
        message: "Reviews are only allowed for accepted collaborations on this campaign",
      });
    }

    // Prevent duplicate reviews from the same user for this campaign + counterpart
    const existing = await Review.findOne({
      campaignId,
      fromUser: fromUserId,
      toUser: toUserId,
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "You have already left a review for this user on this campaign",
      });
    }

    const review = await Review.create({
      campaignId,
      proposalId: proposalId || acceptedProposal._id,
      fromUser: fromUserId,
      toUser: toUserId,
      fromRole,
      toRole,
      rating: numericRating,
      comment: comment || '',
    });

    return res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (err) {
    console.error('Create review error:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
};

// Get all reviews for a given user (public) with average rating
exports.getUserReviews = async (req, res) => {
  try {
    const { userId } = req.params;

    const reviews = await Review.find({ toUser: userId })
      .sort({ createdAt: -1 })
      .populate('fromUser', 'name role')
      .populate('campaignId', 'title');

    const count = reviews.length;
    const avgRating = count
      ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / count
      : null;

    return res.json({
      success: true,
      data: {
        reviews,
        average_rating: avgRating,
        reviews_count: count,
      },
    });
  } catch (err) {
    console.error('Get user reviews error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
};

// Get all reviews for a specific campaign (for debugging / admin or future UI)
exports.getCampaignReviews = async (req, res) => {
  try {
    const { campaignId } = req.params;

    const reviews = await Review.find({ campaignId })
      .sort({ createdAt: -1 })
      .populate('fromUser', 'name role')
      .populate('toUser', 'name role');

    return res.json({ success: true, data: { reviews } });
  } catch (err) {
    console.error('Get campaign reviews error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load campaign reviews' });
  }
};
