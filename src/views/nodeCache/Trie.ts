// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as path from "path";
import {Uri} from "coc.nvim";

export class Trie<T extends IUriData> {
    private _root: TrieNode<T | undefined>;

    constructor() {
        this._root = new TrieNode(undefined);
    }

    public insert(input: T): void {
        if (!input.uri) {
            return;
        }
        let currentNode: TrieNode<T | undefined> = this.root;
        const fsPath: string = Uri.parse(input.uri).fsPath;
        const segments: string[] = fsPath.split(path.sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (!currentNode.children[segment]) {
                currentNode.children[segment] = new TrieNode(undefined);
            }
            currentNode = currentNode.children[segment];
        }

        currentNode.value = input;
    }

    public find(fsPath: string, returnEarly: boolean = false): TrieNode<T | undefined> | undefined {
        let currentNode = this.root;
        const segments: string[] = fsPath.split(path.sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (returnEarly && currentNode.value) {
                return currentNode;
            }
            if (currentNode.children[segment]) {
                currentNode = currentNode.children[segment];
            } else {
                return undefined;
            }
        }

        return currentNode;
    }

    public findFirstAncestorNodeWithData(fsPath: string): TrieNode<T | undefined> | undefined {
        let currentNode: TrieNode<T | undefined> = this.root;
        let res: TrieNode<T | undefined> | undefined;
        const segments: string[] = fsPath.split(path.sep);

        for (const segment of segments) {
            if (!segment) {
                continue;
            }
            if (currentNode.children[segment]) {
                currentNode = currentNode.children[segment];
            } else {
                break;
            }

            if (currentNode.value) {
                res = currentNode;
            }
        }

        return res;
    }

    public get root(): TrieNode<T | undefined> {
        return this._root;
    }
}

export interface IUriData {
    uri?: string;
}

export class TrieNode<T> {
    private _value?: T;
    private _children: INodeChildren<T>;

    constructor(value: T) {
        this._value = value;
        this._children = {};
    }

    public get children(): INodeChildren<T> {
        return this._children;
    }

    public set children(children: INodeChildren<T>) {
        this._children = children;
    }

    public set value(value: T | undefined) {
        this._value = value;
    }

    public get value(): T | undefined {
        return this._value;
    }

}

interface INodeChildren<T> {
    [key: string]: TrieNode<T>;
}
