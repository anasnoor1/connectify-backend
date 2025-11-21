const Campaign = require('../model/Campiagn');
const InfluencerProfile = require("../model/InfluencerProfile");
const BrandProfile = require("../model/BrandProfile");

// Create new campaign
exports.createCampaign = async (req, res) => {
  try {
    const brandId = req.user._id;
    const {
      title,
      description,
      budget,
      category,
      target_audience,
      requirements,
      social_media
    } = req.body;

    // Validate required fields
    if (!title || !description || !budget || !category) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, budget, and category are required'
      });
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
      budget,
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
      if (status && status !== 'all') {
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

    // For influencer views, enrich campaigns with brand avatar_url so
    // the frontend can show brand profile picture in cards.
    if (role === 'influencer' && campaigns && campaigns.length > 0) {
      const brandIds = [
        ...new Set(
          campaigns
            .map(c => {
              if (!c.brand_id) return null;
              // brand_id may be populated (object) or just an ID
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

        campaigns.forEach(c => {
          if (!c.brand_id) return;
          const key = c.brand_id._id ? c.brand_id._id.toString() : c.brand_id.toString();
          if (key && profileMap[key] !== undefined) {
            c.brand_avatar_url = profileMap[key];
          }
        });
      }
    }

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      data: {
        campaigns,
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

// // Create new campaign
// exports.createCampaign = async (req, res) => {
//   try {
//     const brandId = req.user._id;
//     const {
//       title,
//       description,
//       budget,
//       category,
//       target_audience,
//       requirements,
//       social_media
//     } = req.body;

//     // Validate required fields
//     if (!title || !description || !budget || !category) {
//       return res.status(400).json({
//         success: false,
//         message: 'Title, description, budget, and category are required'
//       });
//     }

//     const campaign = new Campaign({
//       brand_id: brandId,
//       title,
//       description,
//       budget,
//       category,
//       target_audience: target_audience || {},
//       requirements: requirements || {},
//       social_media: social_media || [],
//       status: 'pending'
//     });

//     await campaign.save();

//     res.status(201).json({
//       success: true,
//       message: 'Campaign created successfully',
//       data: campaign
//     });

//   } catch (err) {
//     console.error('Create campaign error:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to create campaign'
//     });
//   }
// };

// // Get all campaigns for brand
// exports.getBrandCampaigns = async (req, res) => {
//   try {
//     const brandId = req.user._id;
//     const { status, page = 1, limit = 10 } = req.query;

//     let query = { brand_id: brandId };
//     if (status && status !== 'all') {
//       query.status = status;
//     }

//     const campaigns = await Campaign.find(query)
//       .sort({ created_at: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);

//     const total = await Campaign.countDocuments(query);

//     res.json({
//       success: true,
//       data: {
//         campaigns,
//         totalPages: Math.ceil(total / limit),
//         currentPage: parseInt(page),
//         total
//       }
//     });

//   } catch (err) {
//     console.error('Get campaigns error:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch campaigns'
//     });
//   }
// };

// // Get single campaign
// exports.getCampaign = async (req, res) => {
//   try {
//     const campaign = await Campaign.findOne({
//       _id: req.params.id,
//       brand_id: req.user._id
//     });

//     if (!campaign) {
//       return res.status(404).json({
//         success: false,
//         message: 'Campaign not found'
//       });
//     }

//     res.json({
//       success: true,
//       data: campaign
//     });

//   } catch (err) {
//     console.error('Get campaign error:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to fetch campaign'
//     });
//   }
// };

// // Update campaign
// exports.updateCampaign = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const updateData = { ...req.body, updated_at: new Date() };

//     const campaign = await Campaign.findOneAndUpdate(
//       { _id: id, brand_id: req.user._id },
//       updateData,
//       { new: true, runValidators: true }
//     );

//     if (!campaign) {
//       return res.status(404).json({
//         success: false,
//         message: 'Campaign not found'
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Campaign updated successfully',
//       data: campaign
//     });

//   } catch (err) {
//     console.error('Update campaign error:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to update campaign'
//     });
//   }
// };

// // Delete campaign
// exports.deleteCampaign = async (req, res) => {
//   try {
//     const campaign = await Campaign.findOneAndDelete({
//       _id: req.params.id,
//       brand_id: req.user._id
//     });

//     if (!campaign) {
//       return res.status(404).json({
//         success: false,
//         message: 'Campaign not found'
//       });
//     }

//     res.json({
//       success: true,
//       message: 'Campaign deleted successfully'
//     });

//   } catch (err) {
//     console.error('Delete campaign error:', err);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to delete campaign'
//     });
//   }
// };