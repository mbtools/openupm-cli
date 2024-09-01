import fc from "fast-check";
import { PackumentNotFoundError } from "../../../src/common-errors";
import { tryRemoveProjectDependency } from "../../../src/domain/dependency-management";
import { DomainName } from "../../../src/domain/domain-name";
import {
  hasDependency,
  mapScopedRegistry,
} from "../../../src/domain/project-manifest";
import { RegistryUrl } from "../../../src/domain/registry-url";
import { makeScopedRegistry } from "../../../src/domain/scoped-registry";
import { recordKeys } from "../../../src/utils/record-utils";
import { arbDomainName } from "./domain-name.arb";
import {
  arbManifest,
  arbManifestWithDependencyCount,
  arbNonEmptyManifest,
} from "./project-manifest.arb";

describe("dependency management", () => {
  describe("remove single", () => {
    it("should return error for package that is not in manifest", () => {
      fc.assert(
        fc.property(arbManifest, arbDomainName, (manifest, packageName) => {
          // In the rare case where the manifest has the dependency we cancel
          // the test.
          if (hasDependency(manifest, packageName)) return;

          const error = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrapErr();

          expect(error).toEqual(new PackumentNotFoundError(packageName));
        })
      );
    });

    it("should remove dependency", () => {
      fc.assert(
        fc.property(arbNonEmptyManifest, (manifest) => {
          const packageName = recordKeys(manifest.dependencies)[0]!;

          const [updated] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          const hasDependency = recordKeys(updated.dependencies).includes(
            packageName
          );
          expect(hasDependency).toBeFalsy();
        })
      );
    });

    it("should return removed version", () => {
      fc.assert(
        fc.property(arbNonEmptyManifest, (manifest) => {
          const packageName = recordKeys(manifest.dependencies)[0]!;
          const versionInManifest = manifest.dependencies[packageName]!;

          const [, removedPackage] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          expect(removedPackage).toEqual({
            name: packageName,
            version: versionInManifest,
          });
        })
      );
    });

    it("should remove from scoped registries", () => {
      fc.assert(
        fc.property(arbNonEmptyManifest, (manifest) => {
          const packageName = recordKeys(manifest.dependencies)[0]!;

          const [updated] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          const anyScopedRegistryHasScope =
            updated.scopedRegistries?.some((it) =>
              it.scopes.includes(packageName)
            ) ?? false;
          expect(anyScopedRegistryHasScope).toBeFalsy();
        })
      );
    });

    it("should remove empty scoped registries", () => {
      fc.assert(
        fc.property(arbManifestWithDependencyCount(1), (manifest) => {
          const originalScopedRegistryUrl = manifest.scopedRegistries![0]!.url;
          // Add a second scoped registry so that at least one non-empty registry
          // will remain in the manifest. Otherwise it would fully remove the
          // scoped registries property.
          const otherRegistry = RegistryUrl.parse("http://other.registry");
          manifest = mapScopedRegistry(manifest, otherRegistry, () =>
            makeScopedRegistry("Other registry", otherRegistry, [
              DomainName.parse("com.some.package"),
            ])
          );
          const packageName = recordKeys(manifest.dependencies)[0]!;

          const [updated] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          const hasOriginalScopedRegistry = updated.scopedRegistries!.some(
            (it) => it.url === originalScopedRegistryUrl
          );
          expect(hasOriginalScopedRegistry).toBeFalsy();
        })
      );
    });

    it("should remove from testables", () => {
      fc.assert(
        fc.property(arbNonEmptyManifest, (manifest) => {
          const packageName = recordKeys(manifest.dependencies)[0]!;

          const [updated] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          const hasTestable = updated.testables?.includes(packageName) ?? false;
          expect(hasTestable).toBeFalsy();
        })
      );
    });

    it("should remove scoped registries property if empty", () => {
      fc.assert(
        fc.property(arbManifestWithDependencyCount(1), (manifest) => {
          const packageName = recordKeys(manifest.dependencies)[0]!;

          const [updated] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          expect(updated.scopedRegistries).not.toBeDefined();
        })
      );
    });

    it("should remove testables property if empty", () => {
      fc.assert(
        fc.property(arbManifestWithDependencyCount(1), (manifest) => {
          const packageName = recordKeys(manifest.dependencies)[0]!;

          const [updated] = tryRemoveProjectDependency(
            manifest,
            packageName
          ).unwrap();

          expect(updated.testables).not.toBeDefined();
        })
      );
    });
  });
});
