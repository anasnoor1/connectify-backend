const Campaign = require('../model/Campaign');
const InfluencerProfile = require("../model/InfluencerProfile");
const BrandProfile = require("../model/BrandProfile");
const Proposal = require("../model/Proposal");

// Create new campaign
exports.createCampaign = async (req, res) => {
  try {
    const brandId = req.user._id;
    const {
      title,
      description,
      budgetMin,
      budgetMax,
      category,
      target_audience,
      requirements,
      social_media
    } = req.body;

    // Validate required fields
    if (!title || !description || !budgetMin || !budgetMax || !category) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, budget range (min & max), and category are required'
      });
    }

    // Validate Budget Range
    const min = Number(budgetMin);
    const max = Number(budgetMax);

    if (isNaN(min) || isNaN(max)) {
      return res.status(400).json({ success: false, message: 'Budget must be valid numbers' });
    }
    if (min < 20) {
      return res.status(400).json({ success: false, message: 'Minimum budget must be at least $20' });
    }
    if (max > 20000) {
      return res.status(400).json({ success: false, message: 'Maximum budget cannot exceed $20,000' });
    }
    if (min > max) {
      return res.status(400).json({ success: false, message: 'Minimum budget cannot be greater than maximum budget' });
    }

    if (requirements && requirements.min_followers !== undefined && requirements.min_followers !== null) {
      const minFollowers = Number(requirements.min_followers);
      if (!Number.isFinite(minFollowers) || minFollowers < 1000) {
        return res.status(400).json({
          success: false,
          message: 'Minimum followers requirement must be at least 1000'
        });
      }
    }

    const campaign = new Campaign({
      brand_id: brandId,
      title,
      description,
      budgetMin,
      budgetMax,
      category,
      target_audience: target_audience || {},
      requirements: requirements || {},
      social_media: social_media || [],
      status: 'pending'
    });

    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: campaign
    });

  } catch (err) {
    console.error('Create campaign error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create campaign'
    });
  }
};

// Get campaigns
exports.getBrandCampaigns = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const { status, page = 1, limit = 10 } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;

    const query = {};

    // Brands/Admin: own campaigns (unless explicitly querying something else later)
    if (role !== 'influencer') {
      query.brand_id = userId;
    }

    // Status filtering:
    // - For influencers: by default only show approved/active campaigns
    //   unless a specific status is requested.
    // - For brands: keep existing behaviour.
    if (role === 'influencer') {
      if (status === 'all') {
        query.status = { $in: ['active', 'completed'] };
      } else if (status) {
        query.status = status.toLowerCase();
      } else {
        query.status = 'active';
      }
    } else if (status && status !== 'all') {
      query.status = status.toLowerCase();
    }

    let findQuery = Campaign.find(query)
      .sort({ created_at: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum);

    if (role === 'influencer') {
      findQuery = findQuery.populate('brand_id', 'name email');
    }

    const campaigns = await findQuery;

    // Convert to plain objects to allow adding properties
    let campaignsData = campaigns.map(c => c.toObject());

    // For influencer views, enrich campaigns with brand avatar_url and proposal status
    if (role === 'influencer' && campaignsData.length > 0) {
      const brandIds = [];
      const campaignIds = [];

      campaignsData.forEach(c => {
        campaignIds.push(c._id);
        if (c.brand_id) {
          brandIds.push(c.brand_id._id ? c.brand_id._id.toString() : c.brand_id.toString());
        }
      });

      // Fetch Brand Profiles
      if (brandIds.length > 0) {
        const uniqueBrandIds = [...new Set(brandIds)];
        const brandProfiles = await BrandProfile.find({
          brand_id: { $in: uniqueBrandIds },
        }).select('brand_id avatar_url');

        const profileMap = {};
        for (const bp of brandProfiles) {
          if (bp.brand_id) {
            profileMap[bp.brand_id.toString()] = bp.avatar_url || '';
          }
        }

        campaignsData.forEach(c => {
          if (!c.brand_id) return;
          const key = c.brand_id._id ? c.brand_id._id.toString() : c.brand_id.toString();
          if (key && profileMap[key] !== undefined) {
            c.brand_avatar_url = profileMap[key];
          }
        });
      }

      // Fetch Proposals by this influencer for these campaigns, including completion flag
      const proposals = await Proposal.find({
        campaignId: { $in: campaignIds },
        influencerId: userId
      }).select('campaignId status influencerMarkedComplete');

      const proposalMap = {};
      proposals.forEach(p => {
        proposalMap[p.campaignId.toString()] = {
          status: p.status,
          influencerMarkedComplete: !!p.influencerMarkedComplete,
        };
      });

      campaignsData.forEach(c => {
        const mapEntry = proposalMap[c._id.toString()];
        if (mapEntry) {
          c.proposal_status = mapEntry.status;
          // For influencer views, treat influencerCompleted as a per-influencer flag
          if (mapEntry.influencerMarkedComplete) {
            c.influencerCompleted = true;
          }
        }
      });
    }

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      data: {
        campaigns: campaignsData,
        totalPages: Math.ceil(total / limitNum),
        currentPage: pageNum,
        total
      }
    });

  } catch (err) {
    console.error('Get campaigns error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch campaigns'
    });
  }
};

// Get single campaign
exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      brand_id: req.user._id
    })
      .populate("brand_id", "name email");

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found"
      });
    }

    res.json({
      success: true,
      data: campaign
    });

  } catch (err) {
    console.error("Get campaign error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign"
    });
  }
};

// Update campaign
exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate Budget Range if provided
    if (req.body.budgetMin !== undefined || req.body.budgetMax !== undefined) {
      const min = req.body.budgetMin !== undefined ? Number(req.body.budgetMin) : undefined;
      const max = req.body.budgetMax !== undefined ? Number(req.body.budgetMax) : undefined;

      if (min !== undefined) {
        if (isNaN(min) || min < 20) return res.status(400).json({ success: false, message: 'Minimum budget must be at least $20' });
      }
      if (max !== undefined) {
        if (isNaN(max) || max > 20000) return res.status(400).json({ success: false, message: 'Maximum budget cannot exceed $20,000' });
      }
      if (min !== undefined && max !== undefined && min > max) {
        return res.status(400).json({ success: false, message: 'Minimum budget cannot be greater than maximum budget' });
      }
    }

    // When a brand edits a campaign, always send it back to pending
    // so that admin can review and re-approve. Ignore any incoming
    // status field from the request body.
    const updateData = {
      ...req.body,
      status: 'pending',
      updated_at: new Date(),
    };

    if (updateData.requirements && updateData.requirements.min_followers !== undefined && updateData.requirements.min_followers !== null) {
      const minFollowers = Number(updateData.requirements.min_followers);
      if (!Number.isFinite(minFollowers) || minFollowers < 1000) {
        return res.status(400).json({
          success: false,
          message: 'Minimum followers requirement must be at least 1000'
        });
      }
    }

    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, brand_id: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign
    });

  } catch (err) {
    console.error('Update campaign error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update campaign'
    });
  }
};

// Delete campaign
exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOneAndDelete({
      _id: req.params.id,
      brand_id: req.user._id
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });

  } catch (err) {
    console.error('Delete campaign error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete campaign'
    });
  }
};

// Mark campaign as completed by influencer (per accepted proposal; does not directly change overall status)
exports.markCompletedByInfluencer = async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const { id } = req.params;

    if (role !== 'influencer') {
      return res.status(403).json({
        success: false,
        message: 'Only influencers can mark a campaign as completed from their side'
      });
    }

    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    // Only allow marking completion on active campaigns
    if (campaign.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Only active campaigns can be marked as completed by influencer'
      });
    }

    // Find this influencer's proposal for the campaign (no need for explicit brand acceptance)
    const proposal = await Proposal.findOne({
      campaignId: id,
      influencerId: userId,
    });

    if (!proposal) {
      return res.status(400).json({
        success: false,
        message: 'You must have a proposal on this campaign before marking it as completed',
      });
    }

    // If already marked completed by this influencer, just acknowledge
    if (proposal.influencerMarkedComplete) {
      return res.json({
        success: true,
        message: 'You have already marked this campaign as completed from your side',
      });
    }

    proposal.influencerMarkedComplete = true;
    proposal.influencerCompletedAt = new Date();
    await proposal.save();

    // Recompute campaign-level influencerCompleted: true only when
    // the planned number of influencers (max_influencers, default 1)
    // have all marked completion.
    const completedCount = await Proposal.countDocuments({
      campaignId: id,
      influencerMarkedComplete: true,
    });

    const maxInfluencers =
      (campaign.requirements && campaign.requirements.max_influencers) || 1;

    const allCompleted = completedCount >= maxInfluencers;

    if (allCompleted) {
      campaign.influencerCompleted = true;
      campaign.influencerCompletedAt = new Date();
      campaign.updated_at = new Date();

      await campaign.save();
    }

    return res.json({
      success: true,
      message: allCompleted
        ? 'You marked this campaign as completed. All collaborating influencers have completed; waiting for admin to mark campaign completed.'
        : 'You marked this campaign as completed from your side. Waiting for other influencers to complete.',
    });

  } catch (err) {
    console.error('Mark campaign completed by influencer error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to mark campaign as completed by influencer'
    });
  }
};

exports.getSuggestedCampaigns = async (req, res) => {
  try {
    const influencerId = req.user.id;

    // get influencer profile
    const profile = await InfluencerProfile.findOne({ influencer_id: influencerId });

    if (!profile) {
      return res.status(404).json({ message: "Influencer profile not found" });
    }

    const category = profile.category.toLowerCase();

    // find campaigns with same category
    const suggestions = await Campaign.find({
      category: category,
      status: "active"
    }).populate("brand_id", "name email");

    if (suggestions && suggestions.length > 0) {
      const brandIds = [
        ...new Set(
          suggestions
            .map(c => {
              if (!c.brand_id) return null;
              return c.brand_id._id ? c.brand_id._id.toString() : c.brand_id.toString();
            })
            .filter(Boolean)
        ),
      ];

      if (brandIds.length > 0) {
        const brandProfiles = await BrandProfile.find({
          brand_id: { $in: brandIds },
        }).select('brand_id avatar_url');

        const profileMap = {};
        for (const bp of brandProfiles) {
          if (bp.brand_id) {
            profileMap[bp.brand_id.toString()] = bp.avatar_url || '';
          }
        }

        suggestions.forEach(c => {
          if (!c.brand_id) return;
          const key = c.brand_id._id ? c.brand_id._id.toString() : c.brand_id.toString();
          if (key && profileMap[key] !== undefined) {
            c.brand_avatar_url = profileMap[key];
          }
        });
      }
    }

    return res.status(200).json({
      success: true,
      suggestions
    });

  } catch (error) {
    console.error("Suggested Campaign Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};