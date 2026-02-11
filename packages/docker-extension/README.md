# Outray

Expose your local containers to the internet securely with [Outray](https://outray.dev).

This Docker Extension allows you to create public tunnels for your running containers directly from Docker Desktop.

## Features

- **One-click Expose**: Generate public URLs for your local containers.
- **Secure**: API Key authentication and secure tunnel establishment.
- **Persistent**: Settings and tunnels are saved across restarts.

## Local development

You can use `docker` to build, install and push your extension. Also, we provide an opinionated [Makefile](Makefile) that could be convenient for you. There isn't a strong preference of using one over the other, so just use the one you're most comfortable with.

To build the extension, use `make build-extension` **or**:

```shell
  docker buildx build -t outray/outray-extension:latest . --load
```

To install the extension, use `make install-extension` **or**:

```shell
  docker extension install outray/outray-extension:latest
```

> If you want to automate this command, use the `-f` or `--force` flag to accept the warning message.

To preview the extension in Docker Desktop, open Docker Dashboard once the installation is complete. The left-hand menu displays a new tab with the name of your extension. You can also use `docker extension ls` to see that the extension has been installed successfully.

### Frontend development

During the development of the frontend part, it's helpful to use hot reloading to test your changes without rebuilding your entire extension. To do this, you can configure Docker Desktop to load your UI from a development server.
Assuming your app runs on the default port, start your UI app and then run:

```shell
  cd ui
  npm install
  npm run dev
```

This starts a development server that listens on port `3000`.

You can now tell Docker Desktop to use this as the frontend source. In another terminal run:

```shell
  docker extension dev ui-source outray/outray-extension:latest http://localhost:3000
```

In order to open the Chrome Dev Tools for your extension when you click on the extension tab, run:

```shell
  docker extension dev debug outray/outray-extension:latest
```

Each subsequent click on the extension tab will also open Chrome Dev Tools. To stop this behaviour, run:

```shell
  docker extension dev reset outray/outray-extension:latest
```

### Backend development (optional)

The backend runs a Node.js/Express API that manages the tunnels and persists configuration to a SQLite database. It communicates with the frontend via the Docker Extension socket.

While extensions don't strictly require a backend, Outray uses one to handle secure connections and data persistence reliably.

Whenever you make changes in the [backend](./backend) source code, you will need to compile them and re-deploy a new version of your backend container.
Use the `docker extension update` command to remove and re-install the extension automatically:

```shell
docker extension update outray/outray-extension:latest
```

> Note: The database will persist across updates. To reset it, you must remove the extension and its volume.

## Clean Up

To remove the extension:

```shell
docker extension rm outray/outray-extension:latest
```
