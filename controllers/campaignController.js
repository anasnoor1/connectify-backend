const Campaign = require('../model/Campaign');
const InfluencerProfile = require("../model/InfluencerProfile");
const BrandProfile = require("../model/BrandProfile");
const Proposal = require("../model/Proposal");
const { getIO } = require("../socket");

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

    if (requirements && requirements.max_influencers !== undefined && requirements.max_influencers !== null) {
      const maxInfluencers = Number(requirements.max_influencers);
      if (!Number.isInteger(maxInfluencers) || maxInfluencers < 1 || maxInfluencers > 3) {
        return res.status(400).json({
          success: false,
          message: 'Number of influencers must be a whole number between 1 and 3'
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

    try {
      const io = getIO();
      io.emit('campaigns_updated');
    } catch (e) {
      console.error('Socket emit campaigns_updated failed (create):', e.message || e);
    }

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

    const acceptedCountMap = {};
    if (campaignsData.length > 0) {
      const allCampaignIds = campaignsData.map(c => c._id);
      const acceptedCounts = await Proposal.aggregate([
        { $match: { campaignId: { $in: allCampaignIds }, status: 'accepted' } },
        { $group: { _id: '$campaignId', count: { $sum: 1 } } },
      ]);

      acceptedCounts.forEach(row => {
        if (row && row._id) {
          acceptedCountMap[row._id.toString()] = row.count || 0;
        }
      });

      campaignsData.forEach(c => {
        const maxInfluencers =
          (c.requirements && typeof c.requirements.max_influencers === 'number'
            ? c.requirements.max_influencers
            : 1) || 1;

        const acceptedCount = acceptedCountMap[c._id.toString()] || 0;
        c.acceptedCount = acceptedCount;
        c.isFull = acceptedCount >= maxInfluencers;
      });
    }

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

      // Hide "full" campaigns from influencer active listing unless the influencer
      // is already accepted on that campaign.
      const requestedStatus = status ? status.toLowerCase() : '';
      const isActiveView = !requestedStatus || requestedStatus === 'active' || requestedStatus === 'all';
      if (isActiveView) {
        campaignsData = campaignsData.filter((c) => {
          if (c.status !== 'active') return true;
          if (!c.isFull) return true;
          return c.proposal_status === 'accepted';
        });
      }
    }

    // Keep pagination totals accurate for influencer views where we hide full campaigns.
    let total = await Campaign.countDocuments(query);
    if (role === 'influencer') {
      const requestedStatus = status ? status.toLowerCase() : '';
      const isActiveView = !requestedStatus || requestedStatus === 'active' || requestedStatus === 'all';
      if (isActiveView) {
        const allForCount = await Campaign.find(query).select('_id requirements status').lean();
        const allIds = allForCount.map((c) => c._id);
        const acceptedCounts = await Proposal.aggregate([
          { $match: { campaignId: { $in: allIds }, status: 'accepted' } },
          { $group: { _id: '$campaignId', count: { $sum: 1 } } },
        ]);

        const countsMap = {};
        acceptedCounts.forEach((row) => {
          if (row && row._id) countsMap[row._id.toString()] = row.count || 0;
        });

        const acceptedByMe = await Proposal.find({
          campaignId: { $in: allIds },
          influencerId: userId,
          status: 'accepted',
        }).select('campaignId');

        const acceptedSet = new Set(acceptedByMe.map((p) => p.campaignId.toString()));

        const visibleCount = allForCount.filter((c) => {
          if (c.status !== 'active') return true;
          const maxInfluencers =
            (c.requirements && typeof c.requirements.max_influencers === 'number'
              ? c.requirements.max_influencers
              : 1) || 1;
          const acceptedCount = countsMap[c._id.toString()] || 0;
          const isFull = acceptedCount >= maxInfluencers;
          if (!isFull) return true;
          return acceptedSet.has(c._id.toString());
        }).length;

        total = visibleCount;
      }
    }

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

    const maxInfluencers =
      (campaign.requirements && typeof campaign.requirements.max_influencers === 'number'
        ? campaign.requirements.max_influencers
        : 1) || 1;

    const acceptedCount = await Proposal.countDocuments({
      campaignId: campaign._id,
      status: 'accepted',
    });

    res.json({
      success: true,
      data: {
        ...campaign.toObject(),
        acceptedCount,
        isFull: acceptedCount >= maxInfluencers,
      }
    });

  } catch (err) {
    console.error("Get campaign error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign"
    });
  }
};

// Update campaign (brand only, locked after completion/cancel/dispute)
exports.updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    // Load existing to enforce edit lock
    const existing = await Campaign.findOne({ _id: id, brand_id: req.user._id });
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }
    if (['completed', 'cancelled', 'disputed'].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        message: 'This campaign can no longer be edited because it is closed'
      });
    }

    const maxInfluencers =
      (existing.requirements && typeof existing.requirements.max_influencers === 'number'
        ? existing.requirements.max_influencers
        : 1) || 1;

    const acceptedCount = await Proposal.countDocuments({
      campaignId: existing._id,
      status: 'accepted',
    });

    if (acceptedCount >= maxInfluencers) {
      return res.status(400).json({
        success: false,
        message: 'This campaign can no longer be edited because it has reached the maximum number of influencers'
      });
    }

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

    // When a brand edits a campaign, always send it back to pending for admin review
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

    if (updateData.requirements && updateData.requirements.max_influencers !== undefined && updateData.requirements.max_influencers !== null) {
      const maxInfluencers = Number(updateData.requirements.max_influencers);
      if (!Number.isInteger(maxInfluencers) || maxInfluencers < 1 || maxInfluencers > 3) {
        return res.status(400).json({
          success: false,
          message: 'Number of influencers must be a whole number between 1 and 3'
        });
      }
    }

    const campaign = await Campaign.findOneAndUpdate(
      { _id: id, brand_id: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

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

    try {
      const io = getIO();
      io.emit('campaigns_updated');
    } catch (e) {
      console.error('Socket emit campaigns_updated failed (delete):', e.message || e);
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
      status: 'accepted',
    });

    if (!proposal) {
      return res.status(400).json({
        success: false,
        message: 'You must have an accepted proposal on this campaign before marking it as completed',
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
      status: 'accepted',
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

    try {
      const io = getIO();
      io.emit('campaigns_updated');
    } catch (e) {
      console.error('Socket emit campaigns_updated failed (influencer-complete):', e.message || e);
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

    let suggestionsData = suggestions.map(c => c.toObject());

    if (suggestionsData && suggestionsData.length > 0) {
      const brandIds = [
        ...new Set(
          suggestionsData
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

        suggestionsData.forEach(c => {
          if (!c.brand_id) return;
          const key = c.brand_id._id ? c.brand_id._id.toString() : c.brand_id.toString();
          if (key && profileMap[key] !== undefined) {
            c.brand_avatar_url = profileMap[key];
          }
        });
      }
    }

    const acceptedCountMap = {};
    if (suggestionsData.length > 0) {
      const suggestionIds = suggestionsData.map(c => c._id);
      const acceptedCounts = await Proposal.aggregate([
        { $match: { campaignId: { $in: suggestionIds }, status: 'accepted' } },
        { $group: { _id: '$campaignId', count: { $sum: 1 } } },
      ]);

      acceptedCounts.forEach(row => {
        if (row && row._id) {
          acceptedCountMap[row._id.toString()] = row.count || 0;
        }
      });

      suggestionsData.forEach(c => {
        const maxInfluencers =
          (c.requirements && typeof c.requirements.max_influencers === 'number'
            ? c.requirements.max_influencers
            : 1) || 1;
        const acceptedCount = acceptedCountMap[c._id.toString()] || 0;
        c.acceptedCount = acceptedCount;
        c.isFull = acceptedCount >= maxInfluencers;
      });

      // Do not suggest campaigns that are already full.
      suggestionsData = suggestionsData.filter((c) => !c.isFull);
    }

    return res.status(200).json({
      success: true,
      suggestions: suggestionsData
    });

  } catch (error) {
    console.error("Suggested Campaign Error:", error);
    return res.status(500).json({ message: "Server Error" });
  }
};