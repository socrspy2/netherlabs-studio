import { LayerNode, Shape, ShapeNode } from "./types";

export function cloneLayers(layers: LayerNode[]): LayerNode[] {
  return structuredClone(layers);
}

export function findNode(
  layers: LayerNode[],
  id: string
): { node: LayerNode; parent: LayerNode | null; index: number; parentList: LayerNode[] } | null {
  const stack: { list: LayerNode[]; parent: LayerNode | null }[] = [{ list: layers, parent: null }];
  while (stack.length) {
    const { list, parent } = stack.pop()!;
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (node.id === id) return { node, parent, index: i, parentList: list };
      if (node.kind === "group") {
        stack.push({ list: node.children, parent: node });
      }
    }
  }
  return null;
}

export function updateShape(layers: LayerNode[], id: string, updater: (shape: Shape) => Shape) {
  const found = findNode(layers, id);
  if (!found || found.node.kind !== "shape") return layers;
  found.parentList[found.index] = { ...found.node, shape: updater(found.node.shape) } as ShapeNode;
  return layers;
}

export function removeNodes(layers: LayerNode[], ids: Set<string>): LayerNode[] {
  const prune = (list: LayerNode[]): LayerNode[] => {
    return list
      .filter((node) => !ids.has(node.id))
      .map((node) => {
        if (node.kind === "group") {
          return { ...node, children: prune(node.children) };
        }
        return node;
      })
      .filter((node) => (node.kind === "group" ? node.children.length > 0 || !ids.has(node.id) : true));
  };
  return prune(layers);
}

export function mapNodes(list: LayerNode[], fn: (node: LayerNode) => LayerNode): LayerNode[] {
  return list.map((node) => {
    const next = fn(node);
    if (next.kind === "group") {
      return { ...next, children: mapNodes(next.children, fn) };
    }
    return next;
  });
}

export function flatten(list: LayerNode[]): LayerNode[] {
  const out: LayerNode[] = [];
  const walk = (nodes: LayerNode[]) => {
    for (const node of nodes) {
      out.push(node);
      if (node.kind === "group") walk(node.children);
    }
  };
  walk(list);
  return out;
}

export function reorder(
  layers: LayerNode[],
  id: string,
  direction: "front" | "back" | "up" | "down"
): LayerNode[] {
  const found = findNode(layers, id);
  if (!found) return layers;
  const list = found.parent && found.parent.kind === "group" ? found.parent.children : layers;
  const index = found.index;
  const node = list[index];
  const max = list.length - 1;

  let target = index;
  if (direction === "front") target = max;
  if (direction === "back") target = 0;
  if (direction === "up") target = Math.min(max, index + 1);
  if (direction === "down") target = Math.max(0, index - 1);
  if (target === index) return layers;

  const newList = [...list];
  newList.splice(index, 1);
  newList.splice(target, 0, node);

  if (!found.parent) {
    return newList;
  }
  if (found.parent.kind === "group") {
    found.parent.children = newList;
  }
  return layers;
}

export function groupSelection(layers: LayerNode[], ids: string[], name = "Group"): LayerNode[] {
  if (!ids.length) return layers;
  const selected = new Set(ids);
  const taken: LayerNode[] = [];
  const nextRoot: LayerNode[] = [];

  for (const node of layers) {
    if (selected.has(node.id)) {
      taken.push(node);
    } else {
      nextRoot.push(node);
    }
  }

  const groupId = `group_${crypto.randomUUID()}`;
  const group: LayerNode = {
    id: groupId,
    kind: "group",
    name,
    visible: true,
    locked: false,
    children: taken,
  };

  return [...nextRoot, group];
}

export function ungroup(layers: LayerNode[], id: string): LayerNode[] {
  const found = findNode(layers, id);
  if (!found || found.node.kind !== "group") return layers;
  const { parentList, index, node } = found;
  parentList.splice(index, 1, ...(node as any).children);
  return layers;
}

export function groupWithinSameParent(layers: LayerNode[], ids: string[], name = "Group"): LayerNode[] {
  if (ids.length < 1) return layers;
  const found = ids.map((id) => findNode(layers, id)).filter(Boolean) as NonNullable<ReturnType<typeof findNode>>[];
  if (found.length !== ids.length) return layers;

  const parentId = found[0].parent ? found[0].parent.id : null;
  if (!found.every((f) => (f.parent ? f.parent.id : null) === parentId)) return layers;

  const list = found[0].parentList;
  const indices = found.map((f) => f.index).sort((a, b) => a - b);
  const selected = new Set(ids);

  const children: LayerNode[] = [];
  for (let i = list.length - 1; i >= 0; i--) {
    if (selected.has(list[i].id)) {
      children.unshift(list[i]);
      list.splice(i, 1);
    }
  }
  if (!children.length) return layers;

  const groupId = `group_${crypto.randomUUID()}`;
  const group: LayerNode = { id: groupId, kind: "group", name, visible: true, locked: false, children };
  const insertAt = indices[0] ?? list.length;
  list.splice(insertAt, 0, group);
  return layers;
}

export function moveWithinParent(
  layers: LayerNode[],
  draggedId: string,
  targetId: string,
  position: "before" | "after"
): LayerNode[] {
  const dragged = findNode(layers, draggedId);
  const target = findNode(layers, targetId);
  if (!dragged || !target) return layers;

  const draggedParentId = dragged.parent ? dragged.parent.id : null;
  const targetParentId = target.parent ? target.parent.id : null;
  if (draggedParentId !== targetParentId) return layers;

  const list = dragged.parentList;
  const node = list[dragged.index];
  list.splice(dragged.index, 1);

  const targetIndexNow = findNode(layers, targetId)?.index ?? 0;
  const insertAt = position === "before" ? targetIndexNow : targetIndexNow + 1;
  list.splice(insertAt, 0, node);
  return layers;
}
