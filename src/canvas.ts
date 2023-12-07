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
		width: width ? width : 400,
		height: height ? height : 400,
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

export const CANVAS_CONTENT: CanvasContent = {
	nodes: [
		{
			id: "9ca0dce906eb2b17",
			type: "file",
			file: "CloudAtlas/example/user.md",
			x: -80,
			y: -220,
			width: 340,
			height: 120,
			color: "1",
		},
		{
			id: "bdda4ed7429cf432",
			x: -391,
			y: -201,
			width: 222,
			height: 82,
			color: "2",
			type: "file",
			file: "CloudAtlas/example/user_prompt.md",
		},
		{
			id: "5641ca8bb2160e07",
			type: "file",
			file: "CloudAtlas/example/additional context.md",
			x: -55,
			y: -460,
			width: 290,
			height: 100,
			color: "4",
		},
		{
			id: "9faa2aea9699bf3f",
			x: -53,
			y: 20,
			width: 288,
			height: 147,
			color: "5",
			type: "file",
			file: "CloudAtlas/example/system.md",
		},
	],
	edges: [
		{
			id: "89a5ba1776cd58a5",
			fromNode: "5641ca8bb2160e07",
			fromSide: "bottom",
			toNode: "9ca0dce906eb2b17",
			toSide: "top",
		},
		{
			id: "4864dab35edffc85",
			fromNode: "9faa2aea9699bf3f",
			fromSide: "top",
			toNode: "9ca0dce906eb2b17",
			toSide: "bottom",
		},
		{
			id: "6a6497073b3e0475",
			fromNode: "bdda4ed7429cf432",
			fromSide: "right",
			toNode: "9ca0dce906eb2b17",
			toSide: "left",
		},
	],
};
