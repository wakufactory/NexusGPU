import type { SdfNode, SdfSceneNode } from "./types";

export function getSceneNodeChildren(node: SdfSceneNode): readonly SdfSceneNode[] {
  return node.type === "primitive" ? [] : node.children;
}

export function walkSceneNodesPreOrder(
  sceneNodes: readonly SdfSceneNode[],
  visitor: (node: SdfSceneNode) => void,
) {
  for (const node of sceneNodes) {
    walkSceneNodePreOrder(node, visitor);
  }
}

export function collectSceneNodesPreOrder(sceneNodes: readonly SdfSceneNode[]): SdfSceneNode[] {
  const nodes: SdfSceneNode[] = [];
  walkSceneNodesPreOrder(sceneNodes, (node) => nodes.push(node));
  return nodes;
}

export function countSceneNodes(sceneNodes: readonly SdfSceneNode[]) {
  let count = 0;
  walkSceneNodesPreOrder(sceneNodes, () => {
    count += 1;
  });
  return count;
}

export function collectSdfNodes(sceneNodes: readonly SdfSceneNode[]): SdfNode[] {
  const nodes: SdfNode[] = [];
  walkSceneNodesPreOrder(sceneNodes, (node) => {
    if (node.type === "primitive") {
      nodes.push(node.node);
    }
  });
  return nodes;
}

function walkSceneNodePreOrder(node: SdfSceneNode, visitor: (node: SdfSceneNode) => void) {
  visitor(node);

  for (const child of getSceneNodeChildren(node)) {
    walkSceneNodePreOrder(child, visitor);
  }
}
