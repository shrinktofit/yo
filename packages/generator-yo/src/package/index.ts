import Generator from 'yeoman-generator';
import { readFileSync, existsSync } from 'node:fs';

interface Answers {
  packageName: string;
  isApp: boolean;
  platform: 'general' | 'node' | 'web';
  isVue: boolean;
  bundler: 'tsc' | 'vite';
  withTest: boolean;
}

export default class PackageSubGenerator extends Generator {
  private answers!: Answers;

  async prompting() {
    const scope = this._scopeName;
    this.answers = await this.prompt([
      {
        type: 'input',
        name: 'packageName',
        message: `Package name (without @${scope} prefix)?`,
        validate: (input: string) => {
          if (!input.trim()) return 'Package name is required';
          if (!/^[a-z][a-z0-9-]*$/.test(input.trim())) return 'Package name must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens';
          if (existsSync(this.destinationPath(`packages/${input.trim()}`))) return `Package "packages/${input.trim()}" already exists`;
          return true;
        },
      },
      {
        type: 'list',
        name: 'isApp',
        message: 'Is this an app or a library?',
        choices: [
          { name: 'Library', value: false },
          { name: 'App', value: true },
        ],
        default: false,
      },
      {
        type: 'list',
        name: 'platform',
        message: 'Target platform?',
        choices: [
          { name: 'General (any JavaScript runtime)', value: 'general' },
          { name: 'Node.js', value: 'node' },
          { name: 'Web / Browser', value: 'web' },
        ],
        default: 'general',
      },
      {
        type: 'confirm',
        name: 'isVue',
        message: 'Does this package use Vue?',
        default: false,
        when: (answers: Record<string, unknown>) => answers.platform === 'web',
      },
      {
        type: 'list',
        name: 'bundler',
        message: 'Which transformer/bundler do you want to use?',
        choices: [
          { name: 'tsc (TypeScript compiler)', value: 'tsc' },
          { name: 'vite', value: 'vite' },
        ],
        default: 'tsc',
      },
      {
        type: 'confirm',
        name: 'withTest',
        message: 'Add vitest for testing?',
        default: true,
      },
    ]);
  }

  writing() {
    this._writePackageFiles();
    this._ensureCatalogEntries();
    this._ensureEslintNodeConfig();
    this._ensureVscodeVueSettings();
  }

  async install() {
    const { runInstall } = await this.prompt<{ runInstall: boolean }>([
      {
        type: 'confirm',
        name: 'runInstall',
        message: 'Run pnpm install to install the new dependencies?',
        default: true,
      },
    ]);

    if (runInstall) {
      this.log('\n  Running pnpm install...');
      try {
        this.spawnSync('pnpm', ['install']);
      } catch {
        this.log('  pnpm install failed. Please run it manually: pnpm install');
      }
    }
  }

  end() {
    this.log(`\n  Package "packages/${this.answers.packageName}" created.`);
  }

  private get _projectName(): string {
    const rootPkg = this.destinationPath('package.json');
    if (existsSync(rootPkg)) {
      try {
        const pkg = JSON.parse(readFileSync(rootPkg, 'utf-8'));
        return pkg.name ?? '';
      } catch {
        return '';
      }
    }
    return '';
  }

  private get _scopeName(): string {
    const name = this._projectName;
    if (!name) return 'project';
    if (name.startsWith('@')) {
      return name.slice(1).split('/')[0];
    }
    return name;
  }

  private _latestVersion(pkg: string): string | undefined {
    try {
      const result = this.spawnSync('npm', ['view', pkg, 'version']);
      if (result.exitCode === 0) {
        const out = typeof result.stdout === 'string' ? result.stdout : Array.isArray(result.stdout) ? result.stdout.join('') : '';
        return out.trim() || undefined;
      }
    } catch {
      // fallback
    }
    return undefined;
  }

  private _writePackageFiles() {
    const { packageName, isApp, platform, bundler, withTest, isVue } = this.answers;
    const pkgDir = `packages/${packageName}`;
    const scopeName = this._scopeName;

    const devDeps: Record<string, string> = {};
    const scripts: Record<string, string> = {};

    if (platform === 'node') {
      devDeps['@types/node'] = 'catalog:';
    }

    devDeps[`@${scopeName}/workflow`] = 'workspace:*';
    devDeps.typescript = 'catalog:';

    if (bundler === 'vite') {
      devDeps.vite = 'catalog:';
    }

    if (withTest) {
      devDeps.vitest = 'catalog:';
      scripts.test = 'vitest run';
    }

    if (withTest && platform === 'web') {
      devDeps.jsdom = 'catalog:';
    }

    if (isVue) {
      devDeps.vue = 'catalog:';
      devDeps['vue-tsc'] = 'catalog:';
    }

    if (isApp) {
      scripts.build = bundler === 'vite' ? 'vite build' : 'tsc -b';
      scripts.dev = bundler === 'vite' ? 'vite' : 'tsc --watch';
    } else {
      scripts.build = 'tsc -b';
      scripts.dev = 'tsc --watch';
      if (withTest) {
        scripts['test:compile'] = 'tsc -b test/tsconfig.json';
      }
    }

    this.fs.write(
      this.destinationPath(`${pkgDir}/package.json`),
      JSON.stringify({
        name: `@${scopeName}/${packageName}`,
        version: '0.0.0',
        type: 'module',
        files: ['lib/**/*{.js,.d.ts}'],
        exports: {
          '.': './lib/index.js',
        },
        scripts,
        ...(isVue ? { dependencies: { vue: 'catalog:' } } : {}),
        devDependencies: devDeps,
      }, null, 2) + '\n',
    );

    const tsTypes: string[] = [];
    if (platform === 'node') {
      tsTypes.push('node');
    }

    this.fs.copyTpl(
      this.templatePath('tsconfig.json'),
      this.destinationPath(`${pkgDir}/tsconfig.json`),
      { scopeName, types: tsTypes },
    );

    this.fs.copyTpl(
      this.templatePath('src/index.ts'),
      this.destinationPath(`${pkgDir}/src/index.ts`),
      {},
    );

    if (bundler === 'vite' && !isApp) {
      this.fs.copy(
        this.templatePath('vite.config.ts'),
        this.destinationPath(`${pkgDir}/vite.config.ts`),
      );
    }

    if (withTest) {
      const testTypes: string[] = ['vitest'];
      if (platform === 'node') {
        testTypes.push('node');
      }

      this.fs.copyTpl(
        this.templatePath('test/tsconfig.json'),
        this.destinationPath(`${pkgDir}/test/tsconfig.json`),
        { scopeName, types: testTypes },
      );

      const env = platform === 'web' ? 'jsdom' : 'node';
      this.fs.copyTpl(
        this.templatePath('vitest.config.ts'),
        this.destinationPath(`${pkgDir}/vitest.config.ts`),
        { environment: env },
      );
    }
  }

  private _ensureCatalogEntries() {
    const wsPath = this.destinationPath('pnpm-workspace.yaml');
    if (!existsSync(wsPath)) return;

    const { platform, bundler, withTest, isVue } = this.answers;
    const needed: string[] = ['typescript'];

    if (platform === 'node') needed.push('@types/node');
    if (bundler === 'vite') needed.push('vite');
    if (withTest) needed.push('vitest');
    if (withTest && platform === 'web') needed.push('jsdom');
    if (isVue) {
      needed.push('vue');
      needed.push('vue-tsc');
    }

    if (needed.length === 0) return;

    let content = readFileSync(wsPath, 'utf-8');

    const fallbacks: Record<string, string> = {
      'typescript': '~5.8.3',
      '@types/node': '22.15.17',
      'vite': '^7.3.2',
      'vitest': '^4.1.5',
      'jsdom': '^26.1.0',
      'vue': '^3.5.13',
      'vue-tsc': '^2.2.4',
    };

    const missing: string[] = [];

    for (const key of needed) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const existingRegex = new RegExp(`^\\s+['"]?${escapedKey}['"]?:\\s`, 'm');
      if (existingRegex.test(content)) continue;
      missing.push(key);
    }

    if (missing.length === 0) return;

    const entries = missing.map((key) => {
      const version = this._latestVersion(key) ?? fallbacks[key] ?? '*';
      const value = /^[~^]/.test(version) ? version : `^${version}`;
      return `  '${key}': '${value}'`;
    });

    const catalogIdx = content.indexOf('catalog:');
    if (catalogIdx >= 0) {
      const lineEnd = content.indexOf('\n', catalogIdx);
      const afterLine = content.slice(lineEnd + 1);
      const indentMatch = afterLine.match(/^(\s+)\S/);
      const indent = indentMatch ? indentMatch[1] : '  ';
      content = content.slice(0, lineEnd + 1) + entries.map((e) => `${indent}${e}`).join('\n') + '\n' + afterLine;
    } else {
      content += `\ncatalog:\n${entries.join('\n')}\n`;
    }

    this.fs.write(wsPath, content.endsWith('\n') ? content : content + '\n');
    this.log(`  Added catalog entries: ${missing.join(', ')}`);
  }

  private _ensureEslintNodeConfig() {
    if (this.answers.platform !== 'node') return;

    const eslintPath = this.destinationPath('eslint.config.js');
    if (!existsSync(eslintPath)) return;

    let content = readFileSync(eslintPath, 'utf-8');

    if (content.includes(`import node from '@shrinktofit/eslint-config/node'`)) return;

    content = content.replace(
      /(import stf from '@shrinktofit\/eslint-config';?)/,
      `$1\nimport node from '@shrinktofit/eslint-config/node';`,
    );

    if (!content.includes('node.configs.recommended')) {
      content = content.replace(
        /(\s+stf\.configs\.recommended,?)/,
        `$1\n  node.configs.recommended,`,
      );
    }

    this.fs.write(eslintPath, content.endsWith('\n') ? content : content + '\n');
  }

  private _ensureVscodeVueSettings() {
    if (!this.answers.isVue) return;

    const settingsPath = this.destinationPath('.vscode/settings.json');
    if (!existsSync(settingsPath)) return;

    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (Array.isArray(settings['eslint.validate']) && !settings['eslint.validate'].includes('vue')) {
        settings['eslint.validate'].push('vue');
        this.fs.write(
          settingsPath,
          JSON.stringify(settings, null, 2) + '\n',
        );
        this.log('  Added "vue" to eslint.validate in .vscode/settings.json');
      }
    } catch {
      // malformed settings.json, skip
    }
  }
}
