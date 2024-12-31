{
  description = "ttypaste";
  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
  flake-utils.lib.eachDefaultSystem (system:
    let 
      pkgs = nixpkgs.legacyPackages.${system}; 
    in rec {
      packages = flake-utils.lib.flattenTree rec {
        shell = with pkgs; pkgs.mkShell rec {
          buildInputs = [
            gcc glibc glibc.static gnumake bashInteractive stdenv
          ];
          shellHook = '' '';
        };
      };
      devShell = packages.shell;
    }
  );
}
