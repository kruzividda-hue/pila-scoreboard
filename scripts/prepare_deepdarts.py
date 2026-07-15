#!/usr/bin/env python3
"""Load the published DeepDarts checkpoint and export a browser-ready model."""

import argparse
import os
from pathlib import Path

# DeepDarts checkpoints predate Keras 3 and use TensorFlow's checkpoint format.
os.environ.setdefault("TF_USE_LEGACY_KERAS", "1")

import tensorflow as tf
from tensorflow.keras import layers
from yolov4.tf import YOLOv4
from yolov4.model import yolov4


def build_model(classes_path, input_size=800):
    detector = YOLOv4(tiny=True)
    detector.classes = str(classes_path)
    detector.input_size = (input_size, input_size)
    inputs = layers.Input([input_size, input_size, 3])
    detector.model = yolov4.YOLOv4Tiny(
        anchors=detector.anchors,
        num_classes=len(detector.classes),
        xyscales=detector.xyscales,
        activation="leaky",
        kernel_regularizer=tf.keras.regularizers.l2(0.0005),
    )
    detector.model(inputs)
    return detector


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("output", type=Path, nargs="?")
    parser.add_argument("--input-size", type=int, default=512)
    parser.add_argument("--test-image", type=Path)
    parser.add_argument(
        "--classes",
        type=Path,
        default=Path(__file__).with_name("deepdarts-classes.txt"),
    )
    args = parser.parse_args()

    detector = build_model(args.classes, args.input_size)
    status = detector.model.load_weights(str(args.checkpoint))
    status.expect_partial()
    if args.test_image:
        import cv2
        image = cv2.cvtColor(cv2.imread(str(args.test_image)), cv2.COLOR_BGR2RGB)
        print("Detections:", detector.predict(image, score_threshold=0.20))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        tf.saved_model.save(detector.model, str(args.output))
        print(f"Exported {args.output}")


if __name__ == "__main__":
    main()
