import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterSelect } from "@/components/filter-select";
import { AiSearchBox } from "@/components/ai-search-box";
import { accessIntentLabel, catalogAccessOptions, catalogEditionOptions, isCatalogAccessFilter } from "@/lib/servers/catalog-filters";
import { nicheGameModes, popularGameModes } from "@/lib/servers/game-modes";
import { findServerRegion, isServerCountryCode, serverCountries } from "@/lib/servers/countries";

type CatalogFilterBarProps = {
  query: string;
  mode?: string;
  version?: string;
  /** A country code, or a region code when the selection is exactly a region. */
  country?: string;
  /** A stored access value, or an intent code when the selection is exactly an intent. */
  access?: string;
  edition?: string;
  versionOptions: readonly string[];
  clearHref?: string;
  /** Absent when natural-language search is unconfigured, which leaves the plain keyword box. */
  turnstileSiteKey?: string;
};

// Search plus the five facets a visitor picks between, on one line: mode, version, country, access
// and edition. Sorting is not here on purpose — the results table header owns it, so the bar stays
// about narrowing the catalog rather than reordering it.
export function CatalogFilterBar({
  query,
  mode,
  version,
  country,
  access,
  edition,
  versionOptions,
  clearHref,
  turnstileSiteKey,
}: CatalogFilterBarProps) {
  // "Borrar filtros" promises an empty bar, but the URL it lands on says nothing about the text
  // the visitor had typed without sending it, so the search box is told the catalog is unfiltered
  // again instead of inferring it from a value that never changed.
  const cleared = !query && !mode && !version && !country && !access && !edition;

  // A group the search box inferred is not one of the picker's options, so it is added as one. The
  // alternative was showing "Todos" over an active filter, or the first of eighteen countries as if
  // it were the whole selection — both of which would have the control lie about the results.
  const countryRegion = country && !isServerCountryCode(country) ? findServerRegion(country) : null;
  const accessIntent = access && !isCatalogAccessFilter(access) ? access : null;

  return (
    <Card className="gap-3 px-4 py-4">
      {/* The box owns the search row, the invisible challenge and the suggestion chips: they are
          one control, and only it knows whether the last query was understood. */}
      <AiSearchBox value={query} cleared={cleared} turnstileSiteKey={turnstileSiteKey} />

      <div className="grid grid-cols-2 gap-2 lg:flex lg:flex-wrap lg:items-center">
        <div className="min-w-0 lg:flex-1">
          <FilterSelect id="mode-filter" name="mode" label="Modo" accessibleLabel="Modo de juego" value={mode ?? ""} submitOnChange variant="pill">
            <option value="">Todos</option>
            <optgroup label="Más habituales">
              {popularGameModes.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
            </optgroup>
            <optgroup label="Nicho">
              {nicheGameModes.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}
            </optgroup>
          </FilterSelect>
        </div>
        <div className="min-w-0 lg:flex-1">
          <FilterSelect id="version-filter" name="version" label="Versión" accessibleLabel="Versión de Minecraft" value={version ?? ""} submitOnChange variant="pill">
            <option value="">Todas</option>
            {/* Only versions the monitor has actually seen, so no option leads to an empty page. */}
            {versionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            {version && !versionOptions.includes(version) ? <option value={version}>{version}</option> : null}
          </FilterSelect>
        </div>
        <div className="min-w-0 lg:flex-1">
          <FilterSelect id="country-filter" name="country" label="País" value={country ?? ""} submitOnChange variant="pill">
            <option value="">Todos</option>
            {countryRegion ? <option value={countryRegion.code}>{countryRegion.label}</option> : null}
            {serverCountries.map((option) => <option key={option.code} value={option.code}>{option.flag} {option.label}</option>)}
          </FilterSelect>
        </div>
        <div className="col-span-2 row-start-3 min-w-0 lg:col-span-1 lg:row-auto lg:flex-1">
          <FilterSelect id="access-filter" name="access" label="Acceso" accessibleLabel="Tipo de acceso" value={access ?? ""} submitOnChange variant="pill">
            {accessIntent ? <option value={accessIntent}>{accessIntentLabel(accessIntent)}</option> : null}
            {catalogAccessOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
          </FilterSelect>
        </div>
        <div className="col-start-2 row-start-2 min-w-0 lg:col-auto lg:row-auto lg:flex-1">
          <FilterSelect id="edition-filter" name="edition" label="Edición" value={edition ?? ""} submitOnChange variant="pill">
            {catalogEditionOptions.map((option) => <option key={option.value || "all"} value={option.value}>{option.label}</option>)}
          </FilterSelect>
        </div>
        {clearHref ? (
          <Button asChild variant="ghost" className="col-span-2 h-10 shrink-0 text-muted-foreground hover:text-foreground lg:col-span-1">
            <Link href={clearHref}>Borrar filtros</Link>
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
