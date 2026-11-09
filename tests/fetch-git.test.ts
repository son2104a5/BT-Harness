import { test, describe } from 'node:test';
import assert from 'node:assert';
import { fetchGitRepoTool, GIT_URL_REGEX, fetchGitSchema } from '../src/tools/fetch-git.js';

describe('Fetch Git Repo Tool Suite', () => {
  test('GIT_URL_REGEX validates HTTPS GitHub, GitLab and Bitbucket URLs correctly', () => {
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project.git'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project/'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project.git/'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://gitlab.com/group/subgroup-project'), true);
    assert.strictEqual(GIT_URL_REGEX.test('https://bitbucket.org/team/repo'), true);

    // Invalid / Injection attempts
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project; rm -rf /'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project && echo 1'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project | cat /etc/passwd'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project`id`'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user/project$(whoami)'), false);
    assert.strictEqual(GIT_URL_REGEX.test('http://insecure.com/repo'), false);
    assert.strictEqual(GIT_URL_REGEX.test('http://github.com/user/project'), false);
    assert.strictEqual(GIT_URL_REGEX.test('git@github.com:user/project.git'), false);
    assert.strictEqual(GIT_URL_REGEX.test('ftp://github.com/user/project'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com.attacker.com/user/repo'), false);
    assert.strictEqual(GIT_URL_REGEX.test('https://github.com/user'), false);
    assert.strictEqual(GIT_URL_REGEX.test(''), false);
  });

  test('validates fetchGitSchema with Zod', () => {
    const valid = fetchGitSchema.safeParse({ repoUrl: 'https://github.com/student/assignment' });
    assert.strictEqual(valid.success, true);

    const invalidType = fetchGitSchema.safeParse({ repoUrl: 12345 });
    assert.strictEqual(invalidType.success, false);

    const missingField = fetchGitSchema.safeParse({});
    assert.strictEqual(missingField.success, false);
  });

  test('returns error for invalid git URL without executing git clone', async () => {
    const result = await (fetchGitRepoTool as any).execute({
      repoUrl: 'invalid-url-injection; calc.exe'
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('không hợp lệ'));
  });

  test('returns error for empty or whitespace repoUrl', async () => {
    const result = await (fetchGitRepoTool as any).execute({
      repoUrl: '   '
    });
    assert.strictEqual(result.isError, true);
    assert.ok(result.message.includes('không hợp lệ'));
  });

  test('returns error when repoUrl is null or undefined', async () => {
    const resultNull = await (fetchGitRepoTool as any).execute({
      repoUrl: null as any
    });
    assert.strictEqual(resultNull.isError, true);

    const resultUndefined = await (fetchGitRepoTool as any).execute({
      repoUrl: undefined as any
    });
    assert.strictEqual(resultUndefined.isError, true);
  });
});
