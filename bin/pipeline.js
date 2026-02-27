#!/usr/bin/env node

import { createCLI } from '../src/index.js'

const program = createCLI()
program.parseAsync(process.argv)
