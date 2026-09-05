import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterFormSubmitButton } from "@/components/filter-form-submit-button";
import { FilterSelect } from "@/components/filter-select";
import { ServerSearchInput } from "@/components/server-search-input";
import { catalogAccessOptions, catalogEditionOptions, type CatalogAccessFilter } from "@/lib/servers/catalog-filters";
import { nicheGameModes, popularGameModes } from "@/lib/servers/game-modes";
import { serverCountries } from "@/lib/servers/countries";

type CatalogFilterBarProps = {
  query: string;
  mode?: string;
  version?: string;
  country?: string;
  access?: CatalogAccessFilter;
  edition?: string;
  versionOptions: readonly string[];
  clearHref?: string;
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
}: CatalogFilterBarProps) {
  // "Borrar filtros" promises an empty bar, but the URL it lands on says nothing about the text
  // the visitor had typed without sending it, so the search box is told the catalog is unfiltered
  // again instead of inferring it from a value that never changed.
  const cleared = !query && !mode && !version && !country && !access && !edition;

  return (
    <Card className="gap-3 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="server-search" className="sr-only">Buscar</label>
          <ServerSearchInput value={query} cleared={cleared} />
        </div>
        <FilterFormSubmitButton>Buscar</FilterFormSubmitButton>
      </div>

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
            {serverCountries.map((option) => <option key={option.code} value={option.code}>{option.flag} {option.label}</option>)}
          </FilterSelect>
        </div>
        <div className="col-span-2 row-start-3 min-w-0 lg:col-span-1 lg:row-auto lg:flex-1">
          <FilterSelect id="access-filter" name="access" label="Acceso" accessibleLabel="Tipo de acceso" value={access ?? ""} submitOnChange variant="pill">
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
