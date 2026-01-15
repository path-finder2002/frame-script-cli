# @frame-script/create-latest

FrameScript project initializer - quickly scaffold a new FrameScript project with the latest template and binaries.

## Installation

You can use this tool without installation via npm:

```bash
npm init @frame-script/latest
```

Or install it globally:

```bash
npm install -g @frame-script/create-latest
```

## Usage

### Interactive Mode

Run the command without arguments to be prompted for a project name:

```bash
npm init @frame-script/latest
```

or if installed globally:

```bash
create-latest
```

### With Project Name

Provide the project name as an argument:

```bash
npm init @frame-script/latest my-project
```

or:

```bash
create-latest my-project
```

### Help

Display usage information:

```bash
create-latest --help
```

## What It Does

The initializer performs the following steps:

1. **Fetches the latest FrameScript release** from the GitHub repository
2. **Downloads the project template** (source code and configuration)
3. **Downloads the latest binary release** (pre-compiled binaries)
4. **Creates a new project directory** with your specified name
5. **Extracts the template** into the project directory
6. **Installs binaries** into the `bin/` folder
7. **Installs npm dependencies** automatically

After initialization, you'll have a fully configured FrameScript project ready to use.

## Requirements

- Node.js >= 18
- npm

## Project Structure

After initialization, your project will contain:

```
my-project/
├── bin/              # Pre-compiled FrameScript binaries
├── src/              # Your source code
├── package.json      # Project configuration
└── ...               # Other template files
```

## Error Handling

The tool will exit with an error if:

- No project name is provided
- The target directory already exists
- Network requests fail (GitHub API or downloads)
- npm installation fails

## Development

### Build

```bash
npm run build
```

### Development Mode

Watch mode for development:

```bash
npm run dev
```

### Test Locally

```bash
npm run start my-test-project
```

## Dependencies

- **tar**: Extract tarball archives
- **unzipper**: Extract ZIP archives
- **https**: Download files from GitHub

## License

MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Contributing

This is the official FrameScript project initializer. For issues or contributions, please visit the [FrameScript repository](https://github.com/frame-script/FrameScript).
