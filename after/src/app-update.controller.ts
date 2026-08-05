import { Controller, Get, Query } from '@nestjs/common';
import { Public } from './auth/public.decorator';

type UpdateResponse =
  | { code: 0; message: string }
  | {
      code: 101 | 102;
      message: string;
      data: {
        type: 'apk' | 'wgt' | 'store';
        versionName: string;
        versionCode: number;
        title: string;
        description: string;
        downloadUrl: string;
        storeUrl: string;
        size: number;
        sha256: string;
        mandatory: boolean;
        publishedAt: string;
      };
    };

function positiveInteger(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function compareVersions(left: string, right: string): number {
  const normalize = (value: string): Array<number | string> => value
    .split(/[.-]/)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === 'number' && typeof rightPart === 'number') return leftPart > rightPart ? 1 : -1;
    if (typeof leftPart === 'number') return 1;
    if (typeof rightPart === 'number') return -1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
}

function platformEnv(platform: string | undefined, name: string): string | undefined {
  const normalized = String(platform ?? '').toLowerCase();
  const platformName = normalized === 'ios' ? 'IOS' : normalized === 'android' ? 'ANDROID' : '';
  return (platformName ? process.env[`APP_UPDATE_${platformName}_${name}`] : undefined)
    ?? process.env[`APP_UPDATE_${name}`];
}

@Controller('app-update')
export class AppUpdateController {
  @Public()
  @Get('latest')
  latest(
    @Query('versionCode') currentVersionCodeValue?: string,
    @Query('wgtVersion') currentWgtVersion?: string,
    @Query('platform') platform?: string,
  ): UpdateResponse {
    const normalizedPlatform = String(platform ?? '').toLowerCase();
    const hasIosConfig = Boolean(process.env.APP_UPDATE_IOS_VERSION_NAME);
    const versionName = String(platformEnv(platform, 'VERSION_NAME') ?? '').trim();
    const versionCode = positiveInteger(platformEnv(platform, 'VERSION_CODE'));
    const storeUrl = String(platformEnv(platform, 'STORE_URL') ?? '').trim();
    const configuredType = String(platformEnv(platform, 'TYPE') ?? (normalizedPlatform === 'ios' ? 'store' : 'apk')).toLowerCase();
    const type = configuredType === 'wgt' ? 'wgt' : configuredType === 'store' ? 'store' : 'apk';
    const downloadUrl = String(platformEnv(platform, 'PACKAGE_URL') ?? (type === 'store' ? storeUrl : '')).trim();
    const sha256 = String(platformEnv(platform, 'SHA256') ?? '').trim().toLowerCase();
    const currentVersionCode = positiveInteger(currentVersionCodeValue);

    if (
      (normalizedPlatform === 'ios' && !hasIosConfig)
      || !versionName
      || !versionCode
      || !downloadUrl
      || (type === 'wgt' && !/^[a-f0-9]{64}$/.test(sha256))
    ) {
      return { code: 0, message: '当前暂无可用更新' };
    }

    const hasUpdate = type === 'wgt'
      ? compareVersions(versionName, String(currentWgtVersion ?? '0')) > 0
      : versionCode > currentVersionCode;
    if (!hasUpdate) return { code: 0, message: '当前已是最新版本' };

    return {
      code: type === 'wgt' ? 101 : 102,
      message: '发现新版本',
      data: {
        type,
        versionName,
        versionCode,
        title: platformEnv(platform, 'TITLE') ?? `田间管理 ${versionName}`,
        description: String(platformEnv(platform, 'DESCRIPTION') ?? '').replace(/\\n/g, '\n'),
        downloadUrl,
        storeUrl,
        size: positiveInteger(platformEnv(platform, 'SIZE')),
        sha256,
        mandatory: enabled(platformEnv(platform, 'MANDATORY')),
        publishedAt: String(platformEnv(platform, 'PUBLISHED_AT') ?? '').trim(),
      },
    };
  }
}
