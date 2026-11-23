{
  description = "OAuth2 command-line client";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { self, nixpkgs, ... }:
    let
      # Maps each Nix system to the platform names that npm packages use.
      npmPlatforms = {
        "aarch64-darwin" = {
          os = "darwin";
          arch = "arm64";
        };
        "aarch64-linux" = {
          os = "linux";
          arch = "arm64";
        };
        "x86_64-linux" = {
          os = "linux";
          arch = "x64";
        };
      };
      forAllSystems = nixpkgs.lib.genAttrs (builtins.attrNames npmPlatforms);
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          lib = pkgs.lib;
          npmPlatform = npmPlatforms.${system};

          src = lib.fileset.toSource {
            root = ./.;
            fileset = lib.fileset.unions [
              ./deno.json
              ./deno.lock
              (lib.fileset.fileFilter (file: file.hasExt "ts") ./.)
            ];
          };

          permissions = [
            "--allow-net"
            "--allow-read"
            "--allow-write"
            "--allow-run"
            "--allow-env"
            "--allow-ffi"
            "--allow-sys"
          ];

          # Downloads the dependencies from deno.lock. npm packages are
          # installed once per platform, so the output and its hash are the
          # same on every system. Update the hash after changing deno.lock or
          # the nixpkgs version of Deno.
          denoDependencies = pkgs.stdenvNoCC.mkDerivation {
            # Nix reuses a fixed-output path when the name and hash are
            # unchanged. The name includes the inputs that affect the output,
            # so a stale hash fails the build instead of reusing old files.
            name = "oauth2cli-deno-dependencies-deno-${pkgs.deno.version}-lock-${
              builtins.substring 0 12 (builtins.hashFile "sha256" ./deno.lock)
            }";
            inherit src;
            nativeBuildInputs = [ pkgs.deno ];
            dontFixup = true;
            buildPhase = ''
              runHook preBuild
              export DENO_DIR="$TMPDIR/deno-dir"
              ${lib.concatMapStringsSep "\n" (platform: ''
                rm -rf node_modules
                deno install --frozen --vendor --node-modules-dir=auto \
                  --os ${platform.os} --arch ${platform.arch} \
                  --entrypoint main.ts
                mkdir -p "$out/node_modules"
                mv node_modules "$out/node_modules/${platform.os}-${platform.arch}"
              '') (lib.unique (builtins.attrValues npmPlatforms))}
              mv vendor "$out/vendor"
              runHook postBuild
            '';
            outputHashMode = "recursive";
            outputHashAlgo = "sha256";
            outputHash = "sha256-riVHGkrFVAShiyzc/9gLq84bui+HlBLqOgBl70dfD+o=";
          };
        in
        {
          default = pkgs.stdenv.mkDerivation {
            pname = "oauth2cli";
            version = self.shortRev or self.dirtyShortRev or "unknown";
            inherit src;

            nativeBuildInputs = [
              pkgs.deno
            ]
            ++ lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.autoPatchelfHook;
            # The npm keyring module is a prebuilt native library that links
            # against libgcc_s.
            buildInputs = lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.stdenv.cc.cc.lib;

            buildPhase = ''
              runHook preBuild
              export DENO_DIR="$TMPDIR/deno-dir"
              export DENORT_BIN="${pkgs.deno.denort}/bin/denort"
              cp -r ${denoDependencies}/vendor vendor
              cp -r ${denoDependencies}/node_modules/${npmPlatform.os}-${npmPlatform.arch} node_modules
              chmod -R u+w vendor node_modules
              ${lib.optionalString pkgs.stdenv.hostPlatform.isLinux "autoPatchelf node_modules"}
              deno compile --cached-only --frozen --vendor --node-modules-dir=manual \
                ${lib.escapeShellArgs permissions} \
                --output oauth2cli main.ts
              runHook postBuild
            '';

            installPhase = ''
              runHook preInstall
              install -D oauth2cli "$out/bin/oauth2cli"
              runHook postInstall
            '';

            # deno compile embeds the program in the executable. Stripping or
            # patching the executable would remove or corrupt that data.
            dontStrip = true;
            dontPatchELF = true;
            dontAutoPatchelf = true;

            passthru = { inherit denoDependencies; };

            meta = {
              description = "OAuth2 command-line client that prints access tokens for curl";
              homepage = "https://github.com/bobvanderlinden/oauth2cli";
              license = lib.licenses.mit;
              mainProgram = "oauth2cli";
              platforms = builtins.attrNames npmPlatforms;
            };
          };
        }
      );

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = [ pkgs.deno ];
          };
        }
      );
    };
}
