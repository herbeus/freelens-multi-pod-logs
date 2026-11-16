> [!WARNING]
> This extension is **no longer actively maintained**.
> 
> I originally created this extension for [Lens/OpenLens](https://github.com/andrea-falco/lens-multi-pod-logs), and later adapted it for [Freelens](https://github.com/freelensapp/freelens) upon request from the FreeLens developers.<br>However, FreeLens updates frequently introduce breaking changes that require constant adjustments.
> 
> As I do not use FreeLens myself, I’m unable to dedicate the time necessary to keep this extension up to date with each release.
>
> Feel free to fork this project if you'd like to maintain or improve it.<br>Contributions are also welcome, but please be aware that I may not be able to respond promptly to issues or pull requests.

# Multi Pod Logs Freelens Extension
A [Freelens](https://github.com/freelensapp/freelens) extension that enables you to see logs from multiple pods *(and multiple containers within the pod)* on Kubernetes.

<p align="center">
 <img src="https://img.shields.io/github/license/andrea-falco/freelens-multi-pod-logs" /> <img src="https://img.shields.io/npm/dw/%40andrea-falco%2Ffreelens-multi-pod-logs" /> <img src="https://img.shields.io/npm/dt/%40andrea-falco%2Ffreelens-multi-pod-logs" />
 <br>
 <a href="https://ko-fi.com/A0A8J3CMJ"><img src="https://ko-fi.com/img/githubbutton_sm.svg" /></a>
</p>

## ✨ Log viewers (no stern needed)
Choose the viewer in the extension preferences (*Log Viewer*):

- **kubectl in a terminal tab** (default since 2.2.0): runs `kubectl logs -f --prefix -l <selector>` in a terminal tab of the dock, so the logs keep running next to the other views. kubectl ships with Freelens, nothing else to install. Pods started later (e.g. a rollout) are not picked up; open it again. "All except" a container needs the built-in page when more than one container remains.
- **Built-in log page**: reads the logs through the Kubernetes API, merges lines by time, colors them per pod/container and follows new pods automatically. It has a regex filter, pause, wrap, follow and close. It uses the main view, extensions cannot add tabs to the log dock.
- **stern in a terminal tab**: the original behaviour, needs `stern`.

## 🚧 Requirements (stern mode only)
- Freelens `>= 1.0.0`
- [stern](https://github.com/stern/stern/releases) `>= 1.30.0`
> ⚠️ This extension uses `stern` under the hood, so it needs to be installed on your computer for the extension to work.
> If you don't know how to install it you can follow [these steps](STERN.md).

## 🧰 Installing
> This fork targets **Freelens 2.x**. The npm package `@andrea-falco/freelens-multi-pod-logs` only works with Freelens 1.x.

 1. Download the `.tgz` from the latest [release](https://github.com/herbeus/freelens-multi-pod-logs/releases/latest)
 2. Go to Extensions view (`Menu -> File -> Extensions`), uninstall an older version if present
 3. Enter the path to the `.tgz` (or drag and drop it into the window) and click **Install**
 4. Make sure the extension is enabled

To release a new version: bump `version` in `package.json`, commit and push a matching tag (`v<version>`); the release workflow builds and attaches the `.tgz`.

---

## 🚀 Features
After completing the installation, you will see a new action **Multi Pod Logs** for the menu below:
- Deployments
- StatefulSets
- ReplicaSets
- DaemonSets

![multi-pod-logs-menu](img/deployment-menu.png)

The new action will open a new terminal where all the logs coming from all the containers of all the pods of the resource will be shown.

## ⚙️ Preferences
Some extension behaviors and parameters can be adjusted from the Freelens preferences page, in the appropriate section dedicated to the extension:

![preferences](img/preferences.png)

## 🎨 Colored logs
If you're using Windows 10/11 *(and PowerShell as terminal in Freelens)* and you don't see colored pod logs, you can enable colors running this command:

```
Set-ItemProperty HKCU:\Console VirtualTerminalLevel -Type DWORD 1
```

Then restart Freelens.

---

## Upgrading
To upgrade to a newer release, go to the Extensions view, uninstall the extension, and then re-install it again.

## Uninstalling
Go to the Freelens Extensions view and click the **Uninstall** button next to this extension.
