from app.utils.diff.parse_unified import parse_unified_diff

diff = """@@ -10,3 +10,4 @@
 line A
-line B
-line C
+line B2
+line C2
+line D
"""

blocks = parse_unified_diff(diff, "test.py")

for b in blocks:
    for l in b.lines:
        print(l.type, l.oldLine, l.newLine, l.content)