const Proposal = require("../model/Proposal");

exports.createProposal = async (req, res) => {
  try {
    const { campaignId, amount, message, deliveryTime } = req.body;

    if (!campaignId || !amount || !message || !deliveryTime) {
      return res.status(400).json({ msg: "All fields are required" });
    }

    const proposal = new Proposal({
      campaignId,
      influencerId: req.user.id, // from JWT middleware
      amount,
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

exports.getMyProposals = async (req, res) => {
  try {
    const influencerId = req.user.id; // assuming JWT middleware sets req.user

    // Populate campaign details if needed
    const proposals = await Proposal.find({ influencerId })
      .populate("campaignId", "name description category budget") // only select required fields
      .sort({ createdAt: -1 }); // newest first

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
