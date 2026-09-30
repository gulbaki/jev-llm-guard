#!/usr/bin/env node
import { config } from 'dotenv';
import { runCli } from '../src/cli.js';

config({ quiet: true });
process.exitCode = await runCli(process.argv.slice(2));
