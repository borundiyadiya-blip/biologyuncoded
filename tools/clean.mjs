#!/usr/bin/env node
// Remove the build output. A script rather than `rm -rf` in package.json so it
// works the same in PowerShell, cmd and bash, and rather than `node -e` so it
// doesn't depend on which globals a given Node version exposes to --eval.
import fs from "node:fs";

fs.rmSync("_site", { recursive: true, force: true });
