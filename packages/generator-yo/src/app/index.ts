import Generator from 'yeoman-generator';

interface Answers {
  projectName: string;
  withTurbo: boolean;
  withLerna: boolean;
  runInstall: boolean;
}

export default class ProjectGenerator extends Generator {
  private answers!: Answers;

  async prompting() {
    const dirName = this.contextRoot.split(/[/\\]/).pop() ?? '';
    const defaultName = dirName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    this.answers = await this.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'What is the project name?',
        default: defaultName || 'my-project',
        validate: (input: string) => input.trim().length > 0 || 'Project name is required',
      },
      {
        type: 'confirm',
        name: 'withTurbo',
        message: 'Add turbo support for build orchestration?',
        default: true,
      },
      {
        type: 'confirm',
        name: 'withLerna',
        message: 'Add lerna support for publishing?',
        default: false,
      },
      {
        type: 'confirm',
        name: 'runInstall',
        message: 'Run pnpm install after scaffolding?',
        default: true,
      },
    ]);
  }

  writing() {
    this._writeStaticFiles();
    this._writeRootPackageJson();
    this._writeWorkflowPackage();
    this._writeEslintConfig();
    this._writeVscodeExtensions();

    if (this.answers.withTurbo) {
      this._writeTurboConfig();
    }

    if (this.answers.withLerna) {
      this._writeLernaConfig();
    }
  }

  install() {
    if (this.answers.runInstall) {
      this.log('\n  Running pnpm install...');
      try {
        this.spawnSync('pnpm', ['install']);
      } catch {
        this.log('  pnpm install failed. Please run it manually: pnpm install');
      }
    }
  }

  end() {
    this.log(`\n  Project "${this.answers.projectName}" has been scaffolded successfully!`);
    if (!this.answers.runInstall) {
      this.log('  Run pnpm install to install dependencies.');
    }
  }

  private _writeStaticFiles() {
    const files = [
      '.editorconfig',
      '.gitignore',
      'pnpm-workspace.yaml',
    ];

    for (const file of files) {
      this.fs.copy(
        this.templatePath(file),
        this.destinationPath(file),
      );
    }
  }

  private _writeRootPackageJson() {
    const { projectName, withTurbo, withLerna } = this.answers;

    const scripts: Record<string, string> = {};
    const devDeps: Record<string, string> = {
      '@shrinktofit/eslint-config': '^0.0.3',
      'eslint': '^9.36.0',
    };

    if (withTurbo) {
      scripts.build = 'turbo build';
      scripts.test = 'turbo test';
      devDeps.turbo = '^2.9.12';
    }

    if (withLerna) {
      scripts.ver = 'lerna version --no-push --no-private';
      scripts.pub = 'lerna publish from-package --no-private';
      devDeps.lerna = '^8.2.3';
    }

    this.fs.write(
      this.destinationPath('package.json'),
      JSON.stringify({
        name: projectName,
        version: '0.0.0',
        private: true,
        type: 'module',
        scripts,
        devDependencies: devDeps,
      }, null, 2) + '\n',
    );
  }

  private _writeWorkflowPackage() {
    this.fs.copyTpl(
      this.templatePath('packages/workflow/package.json'),
      this.destinationPath('packages/workflow/package.json'),
      { projectName: this.answers.projectName },
    );

    const tsconfigFiles = ['basic.json', 'lib.json', 'node.json', 'test.json'];
    for (const file of tsconfigFiles) {
      this.fs.copy(
        this.templatePath(`packages/workflow/tsconfig/${file}`),
        this.destinationPath(`packages/workflow/tsconfig/${file}`),
      );
    }
  }

  private _writeEslintConfig() {
    this.fs.copy(
      this.templatePath('eslint.config.js'),
      this.destinationPath('eslint.config.js'),
    );
  }

  private _writeVscodeExtensions() {
    this.fs.copy(
      this.templatePath('.vscode/extensions.json'),
      this.destinationPath('.vscode/extensions.json'),
    );
    this.fs.copy(
      this.templatePath('.vscode/settings.json'),
      this.destinationPath('.vscode/settings.json'),
    );
  }

  private _writeTurboConfig() {
    this.fs.copy(
      this.templatePath('turbo.json'),
      this.destinationPath('turbo.json'),
    );
  }

  private _writeLernaConfig() {
    this.fs.copy(
      this.templatePath('lerna.json'),
      this.destinationPath('lerna.json'),
    );
  }
}
