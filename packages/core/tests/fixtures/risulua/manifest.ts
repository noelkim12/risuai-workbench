import type { DistBuildStrategy, RisuLuaSourceProfile } from '../../../src/domain/risulua-split';

export interface RisuLuaFixtureManifestEntry {
  id: string;
  relativePath: string;
  expectedProfile: RisuLuaSourceProfile;
  expectedStrategy: DistBuildStrategy;
  sha256: string;
  lineCount: number;
  riskFlags: string[];
}

export const RISULUA_FIXTURE_MANIFEST: RisuLuaFixtureManifestEntry[] = [
  {
    id: 'plain_hooks_only',
    relativePath: 'plain/plain_hooks_only.risulua',
    expectedProfile: 'plain-single',
    expectedStrategy: 'concat-build-time-require',
    sha256: 'f0d87ffeb0d790b616e91261166f6bbc89efd2eaacb0b3e83667037cbae61c78',
    lineCount: 13,
    riskFlags: ['host-hooks', 'host-state-write'],
  },
  {
    id: 'plain_listen_edit',
    relativePath: 'plain/plain_listen_edit.risulua',
    expectedProfile: 'plain-single',
    expectedStrategy: 'concat-build-time-require',
    sha256: 'd5cac566413b4f047b03e87a69d94bab765c9d5dfe74eed13c17feacaa37f345',
    lineCount: 10,
    riskFlags: ['listen-edit', 'host-state-write'],
  },
  {
    id: 'plain_dynamic_state_key',
    relativePath: 'plain/plain_dynamic_state_key.risulua',
    expectedProfile: 'plain-single',
    expectedStrategy: 'concat-build-time-require',
    sha256: 'd0c1c4ae3085e0ea747cdb11f2c625f0818086003f39e7eb6606c5f57fd8d50c',
    lineCount: 10,
    riskFlags: ['dynamic-state-key', 'host-state-write'],
  },
  {
    id: 'plain_giant_button_dispatcher',
    relativePath: 'plain/plain_giant_button_dispatcher.risulua',
    expectedProfile: 'plain-single',
    expectedStrategy: 'concat-build-time-require',
    sha256: '25e39af385b341f706609d621e4e3a6818d6aa6f9969aea45e0b7f71cdf575b8',
    lineCount: 12,
    riskFlags: ['giant-dispatcher', 'dynamic-dispatch'],
  },
  {
    id: 'section_three_markers',
    relativePath: 'section-bundle/section_three_markers.risulua',
    expectedProfile: 'section-bundle',
    expectedStrategy: 'section-order-concat',
    sha256: 'b6ed95582b179a5b63b1bd7b57e570184714a003f25d30ffd253ca60c76cb7a8',
    lineCount: 13,
    riskFlags: ['bundle-markers', 'shared-local-scope'],
  },
  {
    id: 'section_scope_leak',
    relativePath: 'section-bundle/section_scope_leak.risulua',
    expectedProfile: 'section-bundle',
    expectedStrategy: 'section-order-concat',
    sha256: '7869c63524dd9eea6c787c43d1c6403d510577ec47197a144813faa472042e55',
    lineCount: 12,
    riskFlags: ['bundle-markers', 'cross-section-local'],
  },
  {
    id: 'preload_dynamic_require',
    relativePath: 'preload-bundle/preload_dynamic_require.risulua',
    expectedProfile: 'preload-bundle',
    expectedStrategy: 'preload-recovery-no-dist',
    sha256: '822e04521ee84c18ebdd5b78f45fbd9b187cd4c4023a45974e3bfb9d1a7faaa6',
    lineCount: 11,
    riskFlags: ['package-preload', 'dynamic-require', 'non-packable'],
  },
  {
    id: 'preload_duplicate_id',
    relativePath: 'preload-bundle/preload_duplicate_id.risulua',
    expectedProfile: 'preload-bundle',
    expectedStrategy: 'preload-recovery-no-dist',
    sha256: 'e16197afe5d2b64a752035311861abac6e684d10c3b5219112c74d172008357b',
    lineCount: 9,
    riskFlags: ['package-preload', 'duplicate-preload-id', 'non-packable'],
  },
  {
    id: 'mixed_preload_and_marker',
    relativePath: 'mixed/mixed_preload_and_marker.risulua',
    expectedProfile: 'mixed-bundle',
    expectedStrategy: 'report-only',
    sha256: '58dbdaa5f907273f70967b844533649e58757dbbcfcb0971783e837ff21ac5b8',
    lineCount: 12,
    riskFlags: ['package-preload', 'bundle-markers', 'mixed-bundle', 'non-packable'],
  },
  {
    id: 'preload_simple',
    relativePath: 'synthetic/preload_simple.risulua',
    expectedProfile: 'preload-bundle',
    expectedStrategy: 'preload-recovery-no-dist',
    sha256: '2376110901602725d64c1ee1acb4f017b04e95fcd5a05e99d706d5854a8b92df',
    lineCount: 17,
    riskFlags: ['package-preload', 'static-require', 'non-packable'],
  },
  {
    id: 'commented_fake_preload',
    relativePath: 'synthetic/commented_fake_preload.risulua',
    expectedProfile: 'plain-single',
    expectedStrategy: 'concat-build-time-require',
    sha256: 'b38a9f9df1be0b6d27399ea012084c0b7ec40175bb3ef6cddd997900beb57a74',
    lineCount: 6,
    riskFlags: ['false-positive-guard'],
  },
  {
    id: 'empty',
    relativePath: 'synthetic/empty.risulua',
    expectedProfile: 'unknown',
    expectedStrategy: 'report-only',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    lineCount: 0,
    riskFlags: ['empty-source'],
  },
  {
    id: 'comment_only',
    relativePath: 'synthetic/comment_only.risulua',
    expectedProfile: 'unknown',
    expectedStrategy: 'report-only',
    sha256: '45679485f21cdad4ee82723e3d6d6b682e5f2afed8fcdebb233a70036ff7ff0f',
    lineCount: 2,
    riskFlags: ['comment-only-source'],
  },
];
