"""Convert an OnlineHTR checkpoint into the packed weights bundled with the plugin.

Model: https://github.com/PellelNitram/OnlineHTR (MIT, Copyright (c) 2024 Martin Lellep),
checkpoint `dataIAMOnDB_featuresLinInterpol20DxDyDtN_decoderGreedy`, epoch 699.
Reads the PyTorch zip checkpoint without PyTorch and writes float16 little-endian values:
for each of 3 layers, forward then reverse: weight_ih, weight_hh, bias_ih + bias_hh;
then linear.weight and linear.bias.

Usage: python3 scripts/export-htr-weights.py path/to/model.ckpt src/ocr/htr-weights.bin
"""
import io
import pickle
import sys
import zipfile

import numpy as np

DTYPES = {"FloatStorage": np.float32, "DoubleStorage": np.float64, "LongStorage": np.int64}


def load_state_dict(path):
    archive = zipfile.ZipFile(path)
    prefix = archive.namelist()[0].split("/")[0]

    def rebuild(storage, offset, size, stride, *_):
        data = np.frombuffer(archive.read(f"{prefix}/data/{storage[2]}"), dtype=DTYPES[storage[1]])
        if not size:
            return data[offset]
        strides = [s * data.itemsize for s in stride]
        return np.lib.stride_tricks.as_strided(data[offset:], shape=size, strides=strides).copy()

    class Unpickler(pickle.Unpickler):
        def find_class(self, module, name):
            if name == "_rebuild_tensor_v2":
                return rebuild
            if module.startswith("torch") and name.endswith("Storage"):
                return name
            try:
                return super().find_class(module, name)
            except Exception:
                # Training-only objects (optimizers, callbacks) are irrelevant for inference.
                return type(name, (), {"__init__": lambda self, *a, **k: None,
                                       "__setstate__": lambda self, state: None})

        def persistent_load(self, pid):
            return pid

    return Unpickler(io.BytesIO(archive.read(f"{prefix}/data.pkl"))).load()["state_dict"]


def main(source, target):
    state = load_state_dict(source)
    parts = []
    for layer in range(3):
        for suffix in ("", "_reverse"):
            key = f"l{layer}{suffix}"
            parts += [state[f"lstm_stack.weight_ih_{key}"], state[f"lstm_stack.weight_hh_{key}"],
                      state[f"lstm_stack.bias_ih_{key}"] + state[f"lstm_stack.bias_hh_{key}"]]
    parts += [state["linear.weight"], state["linear.bias"]]
    packed = np.concatenate([p.astype(np.float32).ravel() for p in parts]).astype("<f2")
    packed.tofile(target)
    print(f"{packed.size} weights, {packed.nbytes} bytes -> {target}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
