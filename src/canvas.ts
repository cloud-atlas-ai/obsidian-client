import { randomUUID } from "crypto";
import { Payload } from "./interfaces";

export type Node = FileNode | TextNode;

export interface FileNode {
	id: string;
	type: string;
	file: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string;
}

export function isFileNode(node: Node): boolean {
	return Boolean((node as FileNode).file);
}

export interface TextNode {
	id: string;
	type: string;
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color: string | undefined;
}

export function textNode(
	text: string,
	x?: number,
	y?: number,
	height?: number,
	width?: number
): TextNode {
	return {
		id: randomUUID(),
		type: "text",
		text: text,
		x: x ? x : 0,
		y: y ? y : 0,
		width: width ? width : 200,
		height: height ? height : 200,
		color: undefined,
	};
}

// {
//     id: "89a5ba1776cd58a5",
//     fromNode: "5641ca8bb2160e07",
//     fromSide: "bottom",
//     toNode: "9ca0dce906eb2b17",
//     toSide: "top",
// },
interface Edge {
	id: string;
	fromNode: string;
	fromSide: string;
	toNode: string;
	toSide: string;
}

enum Color {
	Red = "1",
	Orange = "2",
	Blue = "5",
	Green = "4",
}

export enum NodeType {
	Input,
	System,
	Context,
	UserPrompt,
}

export interface CanvasScaffolding {
	payload: Payload;
	canvas: CanvasContent;
}

export const filterNodesByType = (type: NodeType, nodes: Node[]): Node[] => {
	return nodes.filter((node) => nodeType(node) === type);
};

export const findInputNode = (nodes: Node[]): Node[] => {
	return filterNodesByType(NodeType.Input, nodes);
};

export const findNodeEdges = (node: Node, edges: Edge[]) => {
	return edges.filter((edge) => edge.toNode === node.id);
};

export const nodeType = (node: Node) => {
	if (node.color == Color.Red) {
		return NodeType.Input;
	} else if (node.color == Color.Orange) {
		return NodeType.UserPrompt;
	} else if (node.color == Color.Blue) {
		return NodeType.System;
	} else if (node.color == Color.Green) {
		return NodeType.Context;
	}
};

export interface CanvasContent {
	nodes: Node[];
	edges: Edge[];
}

export const payloadToGraph = (payload: Payload): CanvasContent => {
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	let userPromptNode: TextNode | undefined;
	let inputNode: TextNode | undefined;
	let systemNode: TextNode | undefined;

	if (payload.user?.input) {
		inputNode = textNode(payload.user.input, 600, 500);
		inputNode.color = Color.Red;
		nodes.push(inputNode);
	}

	if (payload.user?.user_prompt) {
		userPromptNode = textNode(payload.user.user_prompt, 500, 750);
		userPromptNode.color = Color.Orange;
		nodes.push(userPromptNode);
	}

	if (userPromptNode && inputNode) {
		const userPromptEdge: Edge = {
			id: randomUUID(),
			fromNode: userPromptNode.id,
			fromSide: "top",
			toNode: inputNode.id,
			toSide: "bottom",
		};
		edges.push(userPromptEdge);
	}

	if (payload.system) {
		systemNode = textNode(payload.system, 500, 250);
		systemNode.color = Color.Blue;
		nodes.push(systemNode);
	}

	if (systemNode && inputNode) {
		const systemEdge: Edge = {
			id: randomUUID(),
			fromNode: systemNode.id,
			fromSide: "bottom",
			toNode: inputNode.id,
			toSide: "top",
		};
		edges.push(systemEdge);
	}

	const additionalContextNodes: TextNode[] = [];

	let addX = 250;
	let addY = 350;

	if (payload.user?.additional_context) {
		Object.keys(payload.user.additional_context).forEach((key, index) => {
			const additionalContextNode: TextNode = textNode(
				// @ts-ignore @typescript-eslint/strictNullChecks
				payload.user.additional_context[key],
				addX,
				addY
			);
			additionalContextNode.color = Color.Green;
			additionalContextNodes.push(additionalContextNode);
			nodes.push(additionalContextNode);
			addX += 25;
			addY += 25;
		});
	}

	const additionalContextEdges: Edge[] = [];
	if (inputNode) {
		additionalContextNodes.forEach((node) => {
			const edge: Edge = {
				id: randomUUID(),
				fromNode: node.id,
				fromSide: "right",
				// @ts-ignore @typescript-eslint/strictNullChecks
				toNode: inputNode.id,
				toSide: "left",
			};
			additionalContextEdges.push(edge);
			edges.push(edge);
		});
	}

	return {
		nodes: nodes,
		edges: edges,
	};
};
