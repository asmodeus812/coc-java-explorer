// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { QuickPickItem, Uri, window, WorkspaceFolder } from "coc.nvim";
import { ensureDir, pathExists } from "fs-extra";
import { globby } from "globby";
import * as _ from "lodash";
import { basename, dirname, extname, isAbsolute, join, normalize, relative } from "path";
import { Jdtls } from "../../java/jdtls";
import { INodeData } from "../../java/nodeData";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IClasspath, IStepMetadata } from "./IStepMetadata";
import { ExportJarMessages, ExportJarStep, toPosixPath } from "./BuildTaskHelperUtility";
import { getJavaExtensionApi } from "coc-java-explorer/src/utils/Client";

export class GenerateJarExecutor implements IExportJarStepExecutor {
    private readonly currentStep: ExportJarStep = ExportJarStep.GenerateJar;

    public async execute(stepMetadata: IStepMetadata): Promise<boolean> {
        return this.generateJar(stepMetadata);
    }

    private async generateJar(stepMetadata: IStepMetadata): Promise<boolean> {
        if (_.isEmpty(stepMetadata.elements)) {
            // If the user uses wizard or custom task with a empty list of elements,
            // the classpaths should be specified manually.
            if (!(await this.generateClasspaths(stepMetadata))) {
                return false;
            }
        }
        const folder: WorkspaceFolder | undefined = stepMetadata.workspaceFolder;
        if (!folder) {
            throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, this.currentStep));
        }
        let destPath = "";
        let folderPath = Uri.parse(folder.uri);
        if (!stepMetadata.outputPath || stepMetadata.outputPath === "") {
            destPath = join(folder.uri, `${folder.name}.jar`);
            const compositePath = join(folderPath.fsPath, `${folder.name}.jar`);
            const inputPath = await window.requestInput("Enter jar output path: ", compositePath);
            destPath = inputPath && inputPath.trim() !== "" ? inputPath : compositePath;
        } else {
            const outputPath: string | undefined = stepMetadata.outputPath;
            if (!outputPath) {
                throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.OUTPUTPATH, this.currentStep));
            }
            destPath = isAbsolute(outputPath) ? outputPath : join(folderPath.fsPath, outputPath);
            if (extname(outputPath) !== ".jar") {
                destPath = join(destPath, folder.name + ".jar");
            }
            await ensureDir(dirname(destPath));
        }
        destPath = normalize(destPath);

        try {
            const mainClass: string | undefined = stepMetadata.mainClass;
            if (mainClass === undefined) {
                throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.MAINCLASS, this.currentStep));
            }
            const classpaths: IClasspath[] = stepMetadata.classpaths;
            if (_.isEmpty(classpaths)) {
                throw new Error(ExportJarMessages.CLASSPATHS_EMPTY);
            }
            const exportResult: boolean | undefined = await Jdtls.exportJar(mainClass, classpaths, destPath, "terminal", null);
            if (exportResult === true) {
                stepMetadata.outputPath = destPath;
                stepMetadata.steps.push(ExportJarStep.GenerateJar);
                void window.showInformationMessage(`Exported jar archive to ${destPath}`);
                return true;
            } else {
                void window.showErrorMessage("Export jar command has failed.");
                return false;
            }
            return exportResult;
        } catch (err) {
            throw err;
        }
    }

    private async generateClasspaths(stepMetadata: IStepMetadata): Promise<boolean> {
        const extensionApi: any = await getJavaExtensionApi();
        const pickItems: IJarQuickPickItem[] = [];
        const uriSet: Set<string> = new Set<string>();
        const projectList: INodeData[] = stepMetadata.projectList;
        if (_.isEmpty(projectList)) {
            throw new Error(ExportJarMessages.WORKSPACE_EMPTY);
        }
        const workspaceFolder: any = stepMetadata.workspaceFolder;
        if (!workspaceFolder) {
            throw new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, this.currentStep));
        }
        for (const project of projectList) {
            const projectUri: string = project.metaData?.UnmanagedFolderInnerPath || project.uri;
            let classpaths: IClasspathResult;
            let testClasspaths: IClasspathResult;
            try {
                classpaths = await extensionApi.getClasspaths(projectUri, { scope: "runtime" });
                testClasspaths = await extensionApi.getClasspaths(projectUri, { scope: "test" });
            } catch (e) {
                throw new Error(e);
            }
            pickItems.push(
                ...(await this.parseDependencyItems(classpaths.classpaths, uriSet, workspaceFolder.uri.fsPath, "runtime")),
                ...(await this.parseDependencyItems(classpaths.modulepaths, uriSet, workspaceFolder.uri.fsPath, "runtime"))
            );
            pickItems.push(
                ...(await this.parseDependencyItems(testClasspaths.classpaths, uriSet, workspaceFolder.uri.fsPath, "test")),
                ...(await this.parseDependencyItems(testClasspaths.modulepaths, uriSet, workspaceFolder.uri.fsPath, "test"))
            );
        }
        if (_.isEmpty(pickItems)) {
            throw new Error(ExportJarMessages.PROJECT_EMPTY);
        }
        if (pickItems.length === 1) {
            await this.setStepMetadataFromOutputFolder(pickItems[0].path, stepMetadata.classpaths);
            return true;
        }
        // Use coc.nvim window.showQuickPick (modern) for interactive multi-select
        const quickPickRes = await window.showQuickPick(pickItems, {
            title: "Pick dependency/output folders",
            canPickMany: true,
            matchOnDescription: true
        });
        const selected: IJarQuickPickItem[] = Array.isArray(quickPickRes) ? quickPickRes : quickPickRes ? [quickPickRes] : [];
        if (!selected || selected === undefined) {
            return false;
        }
        if (selected.length > 0) {
            for (const item of selected) {
                if (item.type === "artifact") {
                    const classpath: IClasspath = {
                        source: item.path,
                        destination: undefined,
                        isArtifact: true
                    };
                    stepMetadata.classpaths.push(classpath);
                } else {
                    await this.setStepMetadataFromOutputFolder(item.path, stepMetadata.classpaths);
                }
            }
            return true;
        }
        // Fallback: select all
        for (const item of pickItems) {
            if (item.type === "artifact") {
                const classpath: IClasspath = {
                    source: item.path,
                    destination: undefined,
                    isArtifact: true
                };
                stepMetadata.classpaths.push(classpath);
            } else {
                await this.setStepMetadataFromOutputFolder(item.path, stepMetadata.classpaths);
            }
        }
        return true;
    }

    private async setStepMetadataFromOutputFolder(folderPath: string, classpaths: IClasspath[]): Promise<void> {
        const posixPath: string = toPosixPath(folderPath);
        for (const path of await globby(posixPath)) {
            const classpath: IClasspath = {
                source: path,
                destination: relative(posixPath, path),
                isArtifact: false
            };
            classpaths.push(classpath);
        }
    }

    private async parseDependencyItems(
        paths: string[],
        uriSet: Set<string>,
        projectPath: string,
        scope: string
    ): Promise<IJarQuickPickItem[]> {
        const dependencyItems: IJarQuickPickItem[] = [];
        for (const classpath of paths) {
            if ((await pathExists(classpath)) === false) {
                continue;
            }
            const extName = extname(classpath);
            // Remove vscode.Uri, just use basic basename/relative
            const baseName = classpath.startsWith(projectPath) ? relative(projectPath, classpath) : basename(classpath);
            const typeValue = extName === ".jar" ? "artifact" : "outputFolder";
            if (!uriSet.has(classpath)) {
                uriSet.add(classpath);
                dependencyItems.push({
                    label: baseName,
                    description: scope,
                    path: classpath,
                    type: typeValue,
                    picked: scope === "runtime"
                });
            }
        }
        return dependencyItems;
    }
}

export interface IClasspathResult {
    projectRoot: string;
    classpaths: string[];
    modulepaths: string[];
}

interface IJarQuickPickItem extends QuickPickItem {
    path: string;
    type: string;
}
