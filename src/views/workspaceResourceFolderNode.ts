// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fs from "fs";
import * as minimatch from "minimatch";
import * as path from "path";
import { Uri, workspace } from "coc.nvim";
import { Explorer } from "../constants";
import { INodeData, NodeKind } from "../java/nodeData";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { FileNode } from "./fileNode";

interface ISiblingClause {
    when: string;
}

interface IFilesExclude {
    [pattern: string]: boolean | ISiblingClause;
}

/**
 * Plain file system entries of a workspace root that holds no java project, honouring files.exclude when it is set.
 */
export async function getWorkspaceResourceData(directoryUri: Uri, workspaceFolderUri: Uri): Promise<INodeData[]> {
    const entries = await fs.promises.readdir(directoryUri.fsPath, { withFileTypes: true }).catch(() => []);
    const excludePatterns = workspace.getConfiguration("files", workspaceFolderUri.toString()).get<IFilesExclude>("exclude", {}) || {};
    const siblingNames = new Set(entries.map((entry) => entry.name));
    return entries
        .map((entry) => {
            const uri = Uri.file(path.join(directoryUri.fsPath, entry.name));
            const relativePath = path.posix.relative(workspaceFolderUri.path, uri.path);
            const kind = entry.isDirectory() ? NodeKind.Folder : NodeKind.File;
            const nodeData: INodeData = { name: entry.name, path: relativePath, uri: uri.toString(), kind };
            return { name: entry.name, nodeData, relativePath };
        })
        .filter(({ name, relativePath }) => !isExcluded(name, relativePath, siblingNames, excludePatterns))
        .map(({ nodeData }) => nodeData);
}

export function createWorkspaceResourceNode(nodeData: INodeData, parent: DataNode, workspaceFolderUri: Uri): ExplorerNode {
    return nodeData.kind === NodeKind.Folder
        ? new WorkspaceResourceFolderNode(nodeData, parent, workspaceFolderUri)
        : new WorkspaceResourceFileNode(nodeData, parent);
}

class WorkspaceResourceFileNode extends FileNode {
    protected get contextValue(): string {
        return Explorer.ContextValueType.WorkspaceResourceFile;
    }
}

class WorkspaceResourceFolderNode extends DataNode {
    constructor(nodeData: INodeData, parent: DataNode, private readonly workspaceFolderUri: Uri) {
        super(nodeData, parent);
    }

    protected async loadData(): Promise<INodeData[]> {
        return this.uri ? getWorkspaceResourceData(Uri.parse(this.uri), this.workspaceFolderUri) : [];
    }

    protected createChildNodeList(): ExplorerNode[] {
        return (this.nodeData.children || []).map((nodeData) => createWorkspaceResourceNode(nodeData, this, this.workspaceFolderUri));
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.WorkspaceResourceFolder;
    }
}

function isExcluded(name: string, relativePath: string, siblingNames: Set<string>, excludePatterns: IFilesExclude): boolean {
    return Object.entries(excludePatterns).some(([pattern, value]) => {
        let excluded = false;
        if (value && minimatch.match([relativePath], pattern, { dot: true }).length > 0) {
            if (typeof value === "boolean") {
                excluded = value;
            } else {
                const basename = path.parse(name).name;
                excluded = siblingNames.has(value.when.replace(/\$\(basename\)/g, basename));
            }
        }
        return excluded;
    });
}
