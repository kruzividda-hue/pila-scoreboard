# DeepDarts D2 browser model

This is the published DeepDarts D2 TensorFlow checkpoint converted to a
800×800 TensorFlow.js graph model with float16 weights. It detects dart tips
and four dartboard calibration keypoints. Inference runs on the user's device.

Source dataset and checkpoint: William McNally, “DeepDarts Dataset”, IEEE
DataPort, 2021, DOI: 10.21227/05e7-xs69. Licensed under CC BY 4.0.

Paper: McNally et al., “DeepDarts: Modeling Keypoints as Objects for Automatic
Scorekeeping in Darts using a Single Camera”, CVPR Workshops 2021.

Model architecture code: `yolov4` 2.0.3 by Hyeonki Hong, MIT License.
