// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as fse from "fs-extra";
import * as _ from "lodash";
import * as path from "path";
import * as semver from "semver";
import { commands, Disposable, Extension, ExtensionContext, extensions, QuickPickItem, Uri, window, workspace } from "coc.nvim";
import { Commands } from "../commands";
import { Utility } from "../utility";

export class ProjectController implements Disposable {
    private disposable: Disposable;

    public constructor(public readonly context: ExtensionContext) {
        context.subscriptions.push(
            commands.registerCommand(Commands.JAVA_PROJECT_CREATE, () => this.createJavaProject()),
            commands.registerCommand(Commands.JAVA_PROJECT_OPEN, () => this.openJavaProject()),
            commands.registerCommand(Commands.INSTALL_EXTENSION, (extensionId: string) => {
                commands.executeCommand("workbench.extensions.installExtension", extensionId);
                // So far there is no API to query the extension's state, so we open the extension's homepage
                // here, where users can check the state: installing, disabled, installed, etc...
                // See: https://github.com/microsoft/vscode/issues/14444
                commands.executeCommand("extension.open", extensionId);
            })
        );
    }

    public dispose() {
        this.disposable.dispose();
    }

    public async openJavaProject() {
        const availableCommands: string[] = commands.commandList.map((c) => c.id);
        if (availableCommands.includes(Commands.WORKBENCH_ACTION_FILES_OPENFOLDER)) {
            return commands.executeCommand(Commands.WORKBENCH_ACTION_FILES_OPENFOLDER);
        }
        return commands.executeCommand(Commands.WORKBENCH_ACTION_FILES_OPENFILEFOLDER);
    }

    public async createJavaProject() {
        const items: IProjectTypeQuickPick[] = projectTypes.map((type: IProjectType) => {
            return {
                label: type.displayName,
                description: type.description,
                detail: type.metadata.extensionName ? `Provided by $(extensions) ${type.metadata.extensionName}` : type.detail,
                metadata: type.metadata
            };
        });
        const choice = await window.showQuickPick(items, {
            placeholder: "Select the project type"
        });
        if (!choice || !(await ensureExtension(choice.label, choice.metadata))) {
            return;
        }
        if (choice.metadata.type === ProjectType.NoBuildTool) {
            await scaffoldSimpleProject(this.context);
        } else if (choice.metadata.createCommandId && choice.metadata.createCommandArgs) {
            await commands.executeCommand(choice.metadata.createCommandId, ...choice.metadata.createCommandArgs);
        } else if (choice.metadata.createCommandId) {
            await commands.executeCommand(choice.metadata.createCommandId);
        }
    }
}

interface IProjectType {
    displayName: string;
    description?: string;
    detail?: string;
    metadata: IProjectTypeMetadata;
}

interface IProjectTypeMetadata {
    type: ProjectType;
    extensionId: string;
    extensionName: string;
    leastExtensionVersion?: string;
    createCommandId: string;
    createCommandArgs?: any[];
}

interface IProjectTypeQuickPick extends QuickPickItem {
    metadata: IProjectTypeMetadata;
}

enum ProjectType {
    NoBuildTool = "NoBuildTool",
    Maven = "Maven",
    Gradle = "Gradle",
    SpringBoot = "SpringBoot",
    Quarkus = "Quarkus",
    MicroProfile = "MicroProfile",
    JavaFX = "JavaFX",
    Micronaut = "Micronaut",
    GDK = "GDK"
}

async function ensureExtension(typeName: string, metaData: IProjectTypeMetadata): Promise<boolean> {
    if (!metaData.extensionId) {
        return true;
    }

    const extension: Extension<any> | undefined = extensions.getExtensionById(metaData.extensionId);
    if (extension === undefined) {
        await promptInstallExtension(typeName, metaData);
        return false;
    }

    if (metaData.leastExtensionVersion && semver.lt(extension.packageJSON.version, metaData.leastExtensionVersion)) {
        await promptUpdateExtension(typeName, metaData);
        return false;
    }

    await extension.activate();
    return true;
}

async function promptInstallExtension(projectType: string, metaData: IProjectTypeMetadata): Promise<void> {
    const choice: string | undefined = await window.showInformationMessage(
        `${metaData.extensionName} is required to create ${projectType} projects. Please re-run the command after the extension is installed.`,
        "Install"
    );
    if (choice === "Install") {
        commands.executeCommand(Commands.INSTALL_EXTENSION, metaData.extensionId);
    }
}

async function promptUpdateExtension(projectType: string, metaData: IProjectTypeMetadata): Promise<void> {
    const choice: string | undefined = await window.showInformationMessage(
        `${metaData.extensionName} needs to be updated to create ${projectType} projects. Please re-run the command after the extension is updated.`,
        "Update"
    );
    if (choice === "Update") {
        commands.executeCommand(Commands.INSTALL_EXTENSION, metaData.extensionId);
    }
}

async function scaffoldSimpleProject(context: ExtensionContext): Promise<void> {
    const workspaceFolder = Utility.getDefaultWorkspaceFolder();
    const location: string | undefined = await window.requestInput(
        "Select the project location",
        workspaceFolder && workspaceFolder.uri,
        {}
    );
    if (!location || !location.length) {
        return;
    }
    const projectName: string | undefined = await window.requestInput("Enter Java project name: ");

    if (!projectName) {
        return;
    }

    const projectRoot: string = path.join(location, projectName);
    const templateRoot: string = path.join(context.extensionPath, "templates", "invisible-project");
    try {
        await fse.ensureDir(projectRoot);
        await fse.copy(templateRoot, projectRoot);
        await fse.ensureDir(path.join(projectRoot, "lib"));
    } catch (error) {
        window.showErrorMessage(error.message);
        return;
    }
    const openInNewWindow = workspace && !_.isEmpty(workspace.workspaceFolders);
    await commands.executeCommand(Commands.VSCODE_OPEN_FOLDER, Uri.file(path.join(location, projectName)), openInNewWindow);
}

const projectTypes: IProjectType[] = [
    {
        displayName: "No build tools",
        detail: "Work with source code directly without any build tools",
        metadata: {
            type: ProjectType.NoBuildTool,
            extensionId: "",
            extensionName: "",
            createCommandId: ""
        }
    },
    {
        displayName: "Maven",
        description: "create from archetype",
        metadata: {
            type: ProjectType.Maven,
            extensionId: "vscjava.vscode-maven",
            extensionName: "Maven for Java",
            createCommandId: "maven.archetype.generate"
        }
    },
    {
        displayName: "Gradle",
        metadata: {
            type: ProjectType.Gradle,
            extensionId: "vscjava.vscode-gradle",
            extensionName: "Gradle for Java",
            leastExtensionVersion: "3.10.0",
            createCommandId: "gradle.createProject"
        }
    },
    {
        displayName: "Spring Boot",
        metadata: {
            type: ProjectType.SpringBoot,
            extensionId: "vscjava.vscode-spring-initializr",
            extensionName: "Spring Initializr Java Support",
            createCommandId: "spring.initializr.createProject"
        }
    },
    {
        displayName: "Quarkus",
        metadata: {
            type: ProjectType.Quarkus,
            extensionId: "redhat.vscode-quarkus",
            extensionName: "Quarkus",
            createCommandId: "quarkusTools.createProject"
        }
    },
    {
        displayName: "MicroProfile",
        metadata: {
            type: ProjectType.MicroProfile,
            extensionId: "microprofile-community.mp-starter-vscode-ext",
            extensionName: "MicroProfile Starter",
            createCommandId: "extension.microProfileStarter"
        }
    },
    {
        displayName: "JavaFX",
        description: "create from archetype",
        metadata: {
            type: ProjectType.JavaFX,
            extensionId: "vscjava.vscode-maven",
            extensionName: "Maven for Java",
            leastExtensionVersion: "0.35.0",
            createCommandId: "maven.archetype.generate",
            createCommandArgs: [
                {
                    archetypeGroupId: "org.openjfx",
                    archetypeArtifactId: "javafx-archetype-fxml",
                    archetypeVersion: "RELEASE"
                }
            ]
        }
    },
    {
        displayName: "Micronaut",
        metadata: {
            type: ProjectType.Micronaut,
            extensionId: "oracle-labs-graalvm.micronaut",
            extensionName: "Launch for Micronaut® framework",
            createCommandId: "extension.micronaut.createProject"
        }
    },
    {
        displayName: "Graal Development Kit for Micronaut",
        metadata: {
            type: ProjectType.GDK,
            extensionId: "oracle-labs-graalvm.gcn",
            extensionName: "Graal Development Kit for Micronaut Launcher",
            createCommandId: "gdk.createGdkProject"
        }
    }
];
