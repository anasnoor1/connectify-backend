const Campaign = require('../model/Campiagn');

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

// Get all campaigns for brand
exports.getBrandCampaigns = async (req, res) => {
  try {
    const brandId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;

    let query = { brand_id: brandId };
    if (status && status !== 'all') {
      query.status = status;
    }

    const campaigns = await Campaign.find(query)
      .sort({ created_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Campaign.countDocuments(query);

    res.json({
      success: true,
      data: {
        campaigns,
        totalPages: Math.ceil(total / limit),
        currentPage: parseInt(page),
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
exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
      brand_id: req.user._id
    })
    .populate("brand_id", "name email"); 
    // Only return fields you want (name, email)

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
    const updateData = { ...req.body, updated_at: new Date() };

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