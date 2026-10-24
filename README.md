# coc-java-explorer

A Java project explorer for [coc.nvim](https://github.com/neoclide/coc.nvim), ported from
[vscode-java-dependency](https://github.com/microsoft/vscode-java-dependency). It shows the Java projects of the
workspace in a tree: source roots, packages, classes, the JRE, the Maven or Gradle dependencies and referenced
libraries. From the tree you create classes and packages, rename and delete; commands add and remove referenced
libraries, create projects and export jars.

Using it inside Neovim is described in the help page: `:help coc-java-explorer`.

## Requirements

- Neovim with [coc.nvim](https://github.com/neoclide/coc.nvim).
- [coc-java](https://github.com/neoclide/coc-java). Its Java language server fills the tree, so coc-java must be
  installed and working.

## Installation

```vim
:CocInstall coc-java-explorer
```

The extension starts when you open a Java file or a workspace with a `pom.xml`, `build.gradle`,
`build.gradle.kts`, `settings.gradle`, `settings.gradle.kts` or `.classpath` file. Open the tree with:

```vim
:CocCommand java.view.package.revealInProjectExplorer
```

## Settings

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `java.dependency.showMembers` | boolean | `false` | Show class members in the project explorer view when a class is expanded. |
| `java.dependency.autoRefresh` | boolean | `true` | Refresh the tree when the classpath changes while the view is open. |
| `java.dependency.refreshDelay` | number | `2000 ms` | Delay before a detected classpath change updates the tree. |
| `java.dependency.syncWithFolderExplorer` | boolean | `true` | Select the current file in the tree when you switch files. The link and unlink commands set it. |
| `java.dependency.packagePresentation` | string (`flat`, `hierarchical`) | `"flat"` | Show packages flat or nested by name segment. |
| `java.project.explorer.showNonJavaResources` | boolean | `false` | Show folders and files that are not Java sources, and workspace folders without a Java project as plain folders. Off, those workspace folders are hidden. |

One more setting is changed by the commands:

- `java.project.referencedLibraries`, a coc-java setting: the jar files of projects without a build tool. The
  library commands change it. It takes a list of paths and glob patterns, or an object that also excludes jars and
  attaches source jars:

```json
"java.project.referencedLibraries": {
    "include": ["library/**/*.jar", "/home/username/lib/foo.jar"],
    "exclude": ["library/sources/**"],
    "sources": {
        "library/bar.jar": "library/sources/bar-src.jar"
    }
}
```

## Troubleshooting

- The tree is empty: the language server is still importing the projects. Projects appear as their import
  finishes; check `:CocCommand workspace.showOutput` and the coc-java output for import errors.
- A workspace folder is missing from the tree: it has no Java project. Run
  `:CocCommand java.project.explorer.showNonJavaResources` to browse it as a plain folder.
- `:help coc-java-explorer` is not found: the help page is registered when the extension starts. Open a Java file
  first.

Every message the extension shows, with what to do, is in `:help coc-java-explorer-messages`.

## Development

```sh
npm install
npm run build       # bundle into lib/
npm run watch       # rebuild on change
npm run typecheck   # type check without emitting
make update         # rebuild the bundled server jar from vscode-java-dependency
```
