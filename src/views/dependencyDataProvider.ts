// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { commands, Emitter, Event, ExtensionContext, ProviderResult, TreeDataProvider, TreeItem, TreeItemAction, Uri, window, workspace } from "coc.nvim";
import * as _ from "lodash";
import * as path from "path";
import { Commands } from "../commands";
import { deleteFiles } from "../explorerCommands/delete";
import { newJavaClass, newPackage } from "../explorerCommands/new";
import { renameFile } from "../explorerCommands/rename";
import { isMutable } from "../explorerCommands/utility";
import { Jdtls } from "../java/jdtls";
import { INodeData, NodeKind } from "../java/nodeData";
import { languageServerApiManager } from "../languageServerApi/languageServerApiManager";
import { Settings } from "../settings";
import { executeExportJarTask } from "../tasks/buildArtifact/BuildArtifactTaskProvider";
import { explorerLock } from "../utils/Lock";
import { DataNode } from "./dataNode";
import { ExplorerNode } from "./explorerNode";
import { explorerNodeCache } from "./nodeCache/explorerNodeCache";
import { ProjectNode } from "./projectNode";
import { WorkspaceNode } from "./workspaceNode";

export class DependencyDataProvider implements TreeDataProvider<ExplorerNode> {
    private _onDidChangeTreeData: Emitter<ExplorerNode | null | undefined> = new Emitter<ExplorerNode | null | undefined>();

    // tslint:disable-next-line:member-ordering
    public onDidChangeTreeData: Event<ExplorerNode | null | undefined> = this._onDidChangeTreeData.event;

    private _rootItems: ExplorerNode[] | undefined = undefined;
    /** Resolved when the first batch of progressive projects arrives. */
    private _progressiveItemsReady: Promise<void> | undefined;
    private _resolveProgressiveItems: (() => void) | undefined;
    private _refreshDelayTrigger: _.DebouncedFunc<(element?: ExplorerNode) => void>;
    /**
     * The element which is pending to be refreshed.
     * `undefined` denotes to root node.
     * `null` means no node is pending.
     */
    private pendingRefreshElement: ExplorerNode | undefined | null;

    constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand(Commands.EXPORT_JAR_REPORT, (terminalId: string, message: string) => {
                console.error(message);
                window.showWarningMessage(message);
            }, undefined, true),
            commands.registerCommand(
                Commands.VIEW_PACKAGE_INTERNAL_REFRESH,
                (debounce?: boolean, element?: ExplorerNode) => this.refresh(debounce, element),
                undefined,
                true
            ),
            commands.registerCommand(Commands.VIEW_PACKAGE_REFRESH, (debounce?: boolean, element?: ExplorerNode) => {
                this.refresh(debounce, element);
                Settings.noticeWhenHidden("Project explorer refreshed");
            }),
            commands.registerCommand(
                Commands.VIEW_PACKAGE_INTERNAL_ADD_PROJECTS,
                (projectUris: string[]) => this.addProgressiveProjects(projectUris),
                undefined,
                true
            ),
            commands.registerCommand(Commands.VIEW_PACKAGE_EXPORT_JAR, async () => {
                executeExportJarTask();
            })
        );

        this.setRefreshDebounceFunc();
    }

    public refresh(debounce = false, element?: ExplorerNode) {
        if (element === undefined || this.pendingRefreshElement === undefined) {
            this._refreshDelayTrigger(undefined);
            this.pendingRefreshElement = undefined;
        } else if (this.pendingRefreshElement === null || element.isItselfOrAncestorOf(this.pendingRefreshElement)) {
            this._refreshDelayTrigger(element);
            this.pendingRefreshElement = element;
        } else if (this.pendingRefreshElement.isItselfOrAncestorOf(element)) {
            this._refreshDelayTrigger(this.pendingRefreshElement);
        } else {
            this._refreshDelayTrigger.flush();
            this._refreshDelayTrigger(element);
            this.pendingRefreshElement = element;
        }
        if (!debounce) {
            // Immediately refresh
            this._refreshDelayTrigger.flush();
        }
    }

    public setRefreshDebounceFunc(wait?: number) {
        if (!wait) {
            wait = Settings.refreshDelay();
        }
        if (this._refreshDelayTrigger) {
            this._refreshDelayTrigger.cancel();
        }
        this._refreshDelayTrigger = _.debounce(this.doRefresh, wait);
    }

    public getTreeItem(element: ExplorerNode): TreeItem | Promise<TreeItem> {
        return element.getTreeItem();
    }

    public resolveActions(_item: TreeItem, element: ExplorerNode): TreeItemAction<ExplorerNode>[] {
        const actions: TreeItemAction<ExplorerNode>[] = [];
        if (element instanceof DataNode && isMutable(element)) {
            const kind = element.nodeData.kind;
            const run = (action: (node: DataNode) => Promise<boolean>, refreshed?: ExplorerNode) =>
                async (node: ExplorerNode) => {
                    if (await action(node as DataNode)) {
                        this.refresh(false, refreshed);
                    }
                };
            if (kind === NodeKind.Package || kind === NodeKind.PackageRoot) {
                actions.push({ title: "New Java Class", handler: run(newJavaClass, element) });
                actions.push({ title: "New Package", handler: run(newPackage, element.getParent()) });
            } else {
                actions.push({ title: "Rename", handler: run(renameFile, element.getParent()) });
            }
            if (kind !== NodeKind.PackageRoot) {
                actions.push({ title: "Delete", handler: run(deleteFiles, element.getParent()) });
            }
        }
        return actions;
    }

    public async getChildren(element?: ExplorerNode): Promise<ExplorerNode[] | undefined | null> {
        if (!(await languageServerApiManager.ready())) {
            return [];
        }

        if (!element && !languageServerApiManager.isFullyReady()) {
            if (!this._rootItems?.length) {
                if (!this._progressiveItemsReady) {
                    this._progressiveItemsReady = new Promise<void>((resolve) => {
                        this._resolveProgressiveItems = resolve;
                    });
                }
                await this._progressiveItemsReady;
            }
            explorerNodeCache.saveNodes(this._rootItems || []);
            return this._rootItems || [];
        }

        const children = !this._rootItems || !element ? await this.getRootNodes() : await element.getChildren();

        explorerNodeCache.saveNodes(children || []);
        return children;
    }

    public getParent(element: ExplorerNode): ProviderResult<ExplorerNode> {
        return element.getParent();
    }

    public async revealPaths(paths: INodeData[]): Promise<DataNode | undefined> {
        const projectNodeData = paths.shift();
        const projects = await this.getRootProjects();
        const project = projects
            ? <DataNode>(
                  projects.find((node: DataNode) => node.path === projectNodeData?.path && node.nodeData.name === projectNodeData?.name)
              )
            : undefined;
        return project?.revealPaths(paths);
    }

    public async getRootProjects(): Promise<ProjectNode[]> {
        const rootElements = await this.getRootNodes();
        let result: ProjectNode[] = [];
        if (rootElements[0] instanceof ProjectNode) {
            result = rootElements.filter(isProjectNode);
        } else {
            for (const rootWorkspace of rootElements) {
                const projects = await rootWorkspace.getChildren();
                if (projects) {
                    result = result.concat(projects.filter(isProjectNode));
                }
            }
        }
        return result;
    }

    private doRefresh(element?: ExplorerNode): void {
        if (!element) {
            this._rootItems = undefined;
        }
        explorerNodeCache.removeNodeChildren(element);
        this._onDidChangeTreeData.fire(element);
        this.pendingRefreshElement = null;
        this.resolveProgressiveItems();
    }

    /**
     * Add projects progressively from the ProjectsImported notifications. The project nodes are created from the uris
     * directly, without querying jdtls, which may be blocked during a long running import.
     */
    public addProgressiveProjects(projectUris: string[]): void {
        const folders = workspace.workspaceFolders;
        // multi-root trees group the projects under workspace nodes, root level project nodes would duplicate them
        if (folders?.length === 1 && !this._rootItems?.some((root) => root instanceof WorkspaceNode)) {
            if (!this._rootItems) {
                this._rootItems = [];
            }
            const existingUris = new Set(
                this._rootItems
                    .filter(isProjectNode)
                    .map((n) => n.uri)
                    .filter((uri): uri is string => Boolean(uri))
                    .map(getProjectUriKey)
            );
            let added = false;
            for (const uriStr of projectUris) {
                const uriKey = getProjectUriKey(uriStr);
                if (!existingUris.has(uriKey)) {
                    const name = uriStr.replace(/\/+$/, "").split("/").pop() || "unknown";
                    this._rootItems.push(new ProjectNode({ name, uri: uriStr, kind: NodeKind.Project }, undefined));
                    existingUris.add(uriKey);
                    added = true;
                }
            }
            if (added) {
                this.resolveProgressiveItems();
                this._onDidChangeTreeData.fire(undefined);
            }
        }
    }

    private resolveProgressiveItems(): void {
        if (this._resolveProgressiveItems) {
            this._resolveProgressiveItems();
            this._resolveProgressiveItems = undefined;
            this._progressiveItemsReady = undefined;
        }
    }

    private async getRootNodes(): Promise<ExplorerNode[]> {
        try {
            await explorerLock.acquireAsync();

            if (this._rootItems) {
                return this._rootItems;
            }

            const hasJavaError: boolean = await Jdtls.checkImportStatus();
            if (hasJavaError) {
                return [];
            }

            const rootItems: ExplorerNode[] = [];
            const folders = workspace.workspaceFolders;
            if (folders?.length) {
                if (folders.length > 1) {
                    const javaProjectsByFolder = Settings.nonJavaResourcesFiltered()
                        ? await Promise.all(folders.map((folder) => Jdtls.getProjects(folder.uri.toString())))
                        : undefined;
                    folders.forEach((folder, index) => {
                        // java only mode leaves no empty non-java workspace roots in the tree
                        if (!javaProjectsByFolder || javaProjectsByFolder[index].length > 0) {
                            rootItems.push(
                                new WorkspaceNode({ name: folder.name, uri: folder.uri.toString(), kind: NodeKind.Workspace }, undefined)
                            );
                        }
                    });
                    this._rootItems = rootItems;
                } else {
                    const result: INodeData[] = await Jdtls.getProjects(folders[0].uri.toString());
                    result.forEach((project) => {
                        rootItems.push(new ProjectNode(project, undefined));
                    });
                    this._rootItems = rootItems;
                }
            }
            return rootItems;
        } finally {
            explorerLock.release();
        }
    }
}

function getProjectUriKey(uriString: string): string {
    const uri = Uri.parse(uriString);
    let key = uri.toString();
    if (uri.scheme === "file") {
        let fsPath = path.normalize(uri.fsPath);
        if (fsPath !== path.parse(fsPath).root) {
            fsPath = fsPath.replace(/[\\/]+$/, "");
        }
        key = process.platform === "win32" ? fsPath.toLowerCase() : fsPath;
    }
    return key;
}

function isProjectNode(node: ExplorerNode): node is ProjectNode {
    return node instanceof ProjectNode;
}
