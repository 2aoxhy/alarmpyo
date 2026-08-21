import { createEnvironmentBriefingHttpGateway, EnvironmentGatewayError } from '../../infrastructure/environment/environment-http-gateway';
import { environmentLocalRepository } from '../../infrastructure/environment/environment-local-repository';
import { createExpoForegroundLocationGateway } from '../../infrastructure/environment/expo-foreground-location-gateway';

import { createEnvironmentBriefingController } from './environment-briefing-controller';

const proxyBaseUrl =
  process.env.EXPO_PUBLIC_ENVIRONMENT_BRIEFING_URL?.trim() ?? '';

const gateway = proxyBaseUrl
  ? createEnvironmentBriefingHttpGateway({ baseUrl: proxyBaseUrl })
  : {
      fetch: async () => {
        throw new EnvironmentGatewayError('not-configured');
      },
    };

/** Native composition seam. No provider credential is read by the app. */
export const environmentBriefingController =
  createEnvironmentBriefingController({
    repository: environmentLocalRepository,
    gateway,
    location: createExpoForegroundLocationGateway(),
    clock: { now: () => new Date() },
  });
