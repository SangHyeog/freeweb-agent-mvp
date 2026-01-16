import { TreeNode } from "../hooks/useFiles";

type Props = {
  tree: TreeNode;
  expanded: Record<string, boolean>;
  setExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  selectedPath: string;
  onOpenFile: (path: string) => void;
  onRenameFile: (path: string) => void;
  disabled?: boolean;
};

export default function FileTree({
  tree,
  expanded,
  setExpanded,
  selectedPath,
  onOpenFile,
  onRenameFile,
  disabled,
}: Props) {
  const renderNode = (node: TreeNode, depth: number = 0) => {
    const pad = 8 + depth * 12;

    if (node.type === "dir") {
      const isOpen = expanded[node.path] ?? false;
      return (
        <div key={node.path}>
          {node.path !== "" && (
            <div
              style={{ padding: "4px 6px", marginLeft: pad, cursor: "pointer", fontWeight: 700 }}
              onClick={() => setExpanded((p) => ({ ...p, [node.path]: !isOpen }))}
            >
              {isOpen ? "▾" : "▸"} {node.name}
            </div>
          )}
          {(node.path === "" || isOpen) &&
            node.children.map((c) => renderNode(c, node.path === "" ? depth : depth + 1))}
        </div>
      );
    }

    const isActive = node.path === selectedPath;
    return (
      <div
        key={node.path}
        style={{
          padding: "4px 6px",
          marginLeft: pad,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: isActive ? "#eef" : "transparent",
        }}
        title={node.path}
      >
        <div
          style={{
            flex: 1,
            cursor: "pointer",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          onClick={() => onOpenFile(node.path)}
        >
          {node.name}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRenameFile(node.path);
          }}
          disabled={disabled}
        >
          R
        </button>
      </div>
    );
  };

  return <div>{renderNode(tree, 0)}</div>;
}
