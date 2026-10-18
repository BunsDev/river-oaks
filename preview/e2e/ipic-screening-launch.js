// How the IPIC screening journey launches Chromium. Locally: headless SwiftShader. Hosted CI sets
// RIVER_OAKS_SCREENING_SOFTWARE=1 and runs under Xvfb on Mesa (ANGLE over GL), the path the shared and
// security journeys use, since headless SwiftShader stalls on CI runners.
export function screeningLaunchOptions(env = process.env, platform = process.platform) {
  if (env.RIVER_OAKS_SCREENING_SOFTWARE === '1') {
    if (platform !== 'linux') throw new Error('Software screening acceptance requires Linux with Xvfb and Mesa.');
    return { headless: false, args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] };
  }
  return { headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
}
