// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import {Explorer} from "../constants";
import {Jdtls} from "../java/jdtls";
import {Uri} from "coc.nvim";
import {INodeData, NodeKind} from "../java/nodeData";
import {Settings} from "../settings";
import {createWorkspaceResourceNode, getWorkspaceResourceData} from "./workspaceResourceFolderNode";
import {DataNode} from "./dataNode";
import {ExplorerNode} from "./explorerNode";
import {NodeFactory} from "./nodeFactory";

export class WorkspaceNode extends DataNode {

    constructor(nodeData: INodeData, parent?: DataNode) {
        super(nodeData, parent);
    }

    protected async loadData(): Promise<INodeData[] | undefined> {
        if (!this.nodeData.uri) {
            return undefined;
        }
        const projects = await Jdtls.getProjects(this.nodeData.uri);
        let result: INodeData[] = projects;
        if (!projects.length && !Settings.nonJavaResourcesFiltered()) {
            // a root without java projects shows its plain files and folders instead of an empty entry
            const workspaceUri = Uri.parse(this.nodeData.uri);
            result = await getWorkspaceResourceData(workspaceUri, workspaceUri);
        }
        return result;
    }

    protected createChildNodeList(): ExplorerNode[] {
        const result: (ExplorerNode | undefined)[] = [];
        const workspaceUri = this.uri ? Uri.parse(this.uri) : undefined;
        if (this.nodeData?.children?.length) {
            this.nodeData.children.forEach((nodeData) => {
                if (workspaceUri && (nodeData.kind === NodeKind.Folder || nodeData.kind === NodeKind.File)) {
                    result.push(createWorkspaceResourceNode(nodeData, this, workspaceUri));
                } else {
                    result.push(NodeFactory.createNode(nodeData, this));
                }
            });
        }
        return result.filter(<T>(n?: T): n is T => Boolean(n));
    }

    protected get contextValue(): string {
        return Explorer.ContextValueType.WorkspaceFolder;
    }
}
