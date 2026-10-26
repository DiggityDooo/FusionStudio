param([switch]$RunTests)
$ErrorActionPreference='Stop'
$project=Split-Path $PSScriptRoot -Parent
$localTools=Join-Path $project 'toolchains'
$buildDrive=$null
if(Test-Path (Join-Path $localTools 'cargo/bin/cargo.exe')) {
  $env:CARGO_HOME=Join-Path $localTools 'cargo'
  $env:RUSTUP_HOME=Join-Path $localTools 'rustup'
  # GCC's manifest specs cannot parse spaces in its installation directory.
  $buildDrive=([char[]]'RSTUVWXYZ' | Where-Object { -not (Test-Path ($_.ToString()+':\')) } | Select-Object -First 1).ToString()+':'
  subst $buildDrive $localTools
  if($LASTEXITCODE -ne 0){throw 'Could not map private compiler directory'}
  $env:PATH=(Join-Path $env:CARGO_HOME 'bin')+';'+$buildDrive+'\mingw64\bin;'+$env:PATH
  $env:CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER='gcc.exe'
  $env:GCC_EXEC_PREFIX=$buildDrive+'/mingw64/lib/gcc/'
}
Push-Location (Join-Path $project 'native')
try {
  cargo build --release
  if($LASTEXITCODE -ne 0){throw 'Native geometry build failed'}
  Copy-Item -LiteralPath 'target/release/fusion_geometry.dll' -Destination 'fusion_geometry.node'
  if($RunTests){cargo test --release --lib; if($LASTEXITCODE -ne 0){throw 'Native core tests failed'}}
} finally { Pop-Location; if($buildDrive){subst $buildDrive /D} }
