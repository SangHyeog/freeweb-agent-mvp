# backend/test/check_file.py
with open("projects/hello-node/main.js", "rb") as f:
    data = f.read()
    print(repr(data))