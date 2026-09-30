#!/usr/bin/env node
import { config } from 'dotenv';
import { runDemo } from '../src/demo.js';

config({ quiet: true });
process.exitCode = await runDemo(process.argv.slice(2));
