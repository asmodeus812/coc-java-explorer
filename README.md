# General

Fork of [vscode-java-dependency](https://github.com/microsoft/vscode-java-dependency) to works with
[coc.nvim](https://github.com/neoclide/coc.nvim).

## Manage Dependencies

You can work with JAR files directly without any build tools. Go to `JAVA PROJECTS` view, find the `Referenced Libraries` node and click the
`+` icon: If you want to fine-tune this, go to `settings.json` and look for the `java.project.referencedLibraries` entry.

```json
"java.project.referencedLibraries": [
    "library/**/*.jar",
    "/home/username/lib/foo.jar"
]
```

You can tell that the glob pattern is supported. And here's more - you can include/exclude certain files, and attach source JARs:

```json
"java.project.referencedLibraries": {
    "include": [
        "library/**/*.jar",
        "/home/username/lib/foo.jar"
    ],
    "exclude": [
        "library/sources/**"
    ],
    "sources": {
        "library/bar.jar": "library/sources/bar-src.jar"
    }
}
```

## Settings

| Setting Name                                 | Description                                                                                 | Default Value |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| `java.dependency.showMembers`                | Specify whether to show the members in the Java Projects explorer.                          | `false`       |
| `java.dependency.autoRefresh`                | Specify whether to automatically sync the change from editor to the Java Projects explorer. | `true`        |
| `java.dependency.refreshDelay`               | The delay time (ms) the auto refresh is invoked when changes are detected.                  | `2000ms`      |
| `java.dependency.packagePresentation`        | Specify how to display the package. Supported values are: `flat`, `hierarchical`.           | `flat`        |
| `java.project.explorer.showNonJavaResources` | When enabled, the explorer shows non-Java resources.                                        | `true`        |
