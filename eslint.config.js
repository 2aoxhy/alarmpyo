// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/models/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "@/application/**",
            "@/infrastructure/**",
            "@/features/**",
            "@/app/**",
            "@/store/**",
            "@/services/**",
            "@/components/**",
            "@/hooks/**",
            "../application/**",
            "../infrastructure/**",
            "../features/**",
            "../app/**",
            "../store/**",
            "../services/**",
            "../components/**",
            "../hooks/**",
          ],
          message: "Domain models must not depend on application, platform, or UI layers.",
        }],
      }],
    },
  },
  {
    files: ["src/application/runtime/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "@/infrastructure/**",
            "@/features/**",
            "@/app/**",
            "@/store/**",
            "@/services/**",
            "@/components/**",
            "@/hooks/**",
            "../../infrastructure/**",
            "../../features/**",
            "../../app/**",
            "../../store/**",
            "../../services/**",
            "../../components/**",
            "../../hooks/**",
          ],
          message: "Application runtime contracts must depend only on domain and application code.",
        }],
      }],
    },
  },
  {
    files: ["src/infrastructure/runtime/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "@/features/**",
            "@/app/**",
            "@/store/**",
            "@/components/**",
            "@/hooks/**",
            "../../features/**",
            "../../app/**",
            "../../store/**",
            "../../components/**",
            "../../hooks/**",
          ],
          message: "Infrastructure adapters must not depend on routes, stores, or UI layers.",
        }],
      }],
    },
  },
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@react-native-async-storage/async-storage",
            message: "Routes must use a feature/application controller instead of storage directly.",
          },
          {
            name: "expo-haptics",
            message: "Routes must request native feedback through the shared feedback controller.",
          },
          {
            name: "@/services/alarmpyo-alarm-service",
            message: "Routes must use an alarm feature controller instead of the native alarm service.",
          },
          {
            name: "@/hooks/use-alarm-runtime-status",
            message: "Routes must consume alarm runtime state through a feature controller.",
          },
          {
            name: "@/services/sleep-reminder-service",
            message: "Routes must use a feature controller instead of the native sleep service.",
          },
          {
            name: "@/services/play-app-update-service",
            message: "Routes must use an update feature controller instead of the native update service.",
          },
          {
            name: "@/services/backup-file-service",
            message: "Routes must use a data-settings controller instead of file infrastructure.",
          },
          {
            name: "@/services/encrypted-backup-service",
            message: "Routes must use a data-settings controller instead of crypto/file infrastructure.",
          },
          {
            name: "@/services/work-settings-share-file-service",
            message: "Routes must use a data-settings controller instead of file infrastructure.",
          },
          {
            name: "@/services/widget-pin-service",
            message: "Routes must use a display-settings controller instead of native widget pinning.",
          },
          {
            name: "@/services/app-distribution",
            message: "Routes must resolve distribution work through a feature controller.",
          },
          {
            name: "@/services/official-shift-pattern-service",
            message: "Routes must fetch official patterns through a pattern-library controller.",
          },
          {
            name: "@/services/shift-pattern-file-service",
            message: "Routes must import and share pattern files through a pattern-library controller.",
          },
          {
            name: "@/services/apk-update-service",
            message: "Routes must use an update controller instead of APK infrastructure.",
          },
        ],
        patterns: [{
          group: ["@/infrastructure/**", "../infrastructure/**", "../../infrastructure/**"],
          message: "Routes must depend on controllers/presentation models, not infrastructure adapters.",
        }],
      }],
    },
  },
  {
    files: ["src/features/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "@react-native-async-storage/async-storage",
            message: "Feature UI must receive storage work through a controller.",
          },
          {
            name: "expo-updates",
            message: "Feature UI must receive update runtime work through a controller.",
          },
          {
            name: "expo-haptics",
            message: "Feature UI must request native feedback through the shared feedback controller.",
          },
          {
            name: "@/services/app-distribution",
            message: "Feature UI must resolve distribution work through a controller.",
          },
          {
            name: "@/services/play-app-update-service",
            message: "Feature UI must use a Play update controller.",
          },
          {
            name: "@/services/apk-update-service",
            message: "Feature UI must use a direct update controller.",
          },
          {
            name: "@/services/official-shift-pattern-service",
            message: "Feature UI must fetch official patterns through a controller.",
          },
          {
            name: "@/services/shift-pattern-file-service",
            message: "Feature UI must perform pattern file work through a controller.",
          },
          {
            name: "@/services/widget-pin-service",
            message: "Feature UI must perform widget pinning through a controller.",
          },
        ],
        patterns: [{
          group: ["@/infrastructure/**", "../../infrastructure/**", "../../../infrastructure/**"],
          message: "Feature UI must not depend on infrastructure adapters directly.",
        }],
      }],
    },
  },
  {
    // Composition/controller files are the single narrow feature-layer seam
    // allowed to assemble platform adapters. UI components remain restricted.
    files: [
      "src/features/**/*-controller.{ts,tsx}",
      "src/features/**/use-*-controller.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
]);
