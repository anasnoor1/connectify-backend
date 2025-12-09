const Proposal = require("../model/Proposal");
const User = require("../model/User");
const InfluencerProfile = require("../model/InfluencerProfile");
const BrandProfile = require("../model/BrandProfile");
const Campaign = require("../model/Campaign");

exports.getLandingHighlights = async (req, res) => {
  try {
    // Basic counts (only verified & not deleted users)
    const [totalBrands, totalInfluencers] = await Promise.all([
      User.countDocuments({ role: "brand", is_deleted: false, is_verified: true }),
      User.countDocuments({ role: "influencer", is_deleted: false, is_verified: true }),
    ]);

    const matchStage = { status: "accepted" };

    // Top influencers hired most times
    const topInfluencersAgg = await Proposal.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$influencerId",
          hires: { $sum: 1 },
          lastHire: { $max: "$updatedAt" },
        },
      },
      { $sort: { hires: -1, lastHire: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "influencerprofiles",
          localField: "_id",
          foreignField: "influencer_id",
          as: "profile",
        },
      },
      {
        $project: {
          _id: 1,
          hires: 1,
          name: { $ifNull: [{ $arrayElemAt: ["$user.name", 0] }, "Influencer"] },
          role: { $arrayElemAt: ["$user.role", 0] },
          avatar_url: { $ifNull: [{ $arrayElemAt: ["$profile.avatar_url", 0] }, null] },
          category: { $ifNull: [{ $arrayElemAt: ["$profile.category", 0] }, null] },
        },
      },
    ]);

    // Top brands hiring most
    const topBrandsAgg = await Proposal.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "campaigns",
          localField: "campaignId",
          foreignField: "_id",
          as: "campaign",
        },
      },
      { $unwind: "$campaign" },
      {
        $group: {
          _id: "$campaign.brand_id",
          hires: { $sum: 1 },
          lastHire: { $max: "$updatedAt" },
        },
      },
      { $sort: { hires: -1, lastHire: -1 } },
      { $limit: 6 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "brandprofiles",
          localField: "_id",
          foreignField: "brand_id",
          as: "profile",
        },
      },
      {
        $project: {
          _id: 1,
          hires: 1,
          name: {
            $ifNull: [
              { $arrayElemAt: ["$profile.company_name", 0] },
              { $arrayElemAt: ["$user.name", 0] },
            ],
          },
          avatar_url: { $ifNull: [{ $arrayElemAt: ["$profile.avatar_url", 0] }, null] },
          industry: { $ifNull: [{ $arrayElemAt: ["$profile.industry", 0] }, null] },
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalBrands,
        totalInfluencers,
        topInfluencers: topInfluencersAgg,
        topBrands: topBrandsAgg,
      },
    });
  } catch (err) {
    console.error("Landing highlights error:", err);
    return res.status(500).json({ success: false, message: "Failed to load landing data" });
  }
};
