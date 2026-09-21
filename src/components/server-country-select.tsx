import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { serverCountries } from "@/lib/servers/countries";

type ServerCountrySelectProps = {
  id: string;
  defaultValue?: string | null;
  meta?: React.ReactNode;
  error?: string;
  onValueChange?: (country: string) => void;
};

/**
 * Where the community plays from, not where the machine is hosted — see `countries.ts`.
 *
 * Required: it is one of the catalog's filters, so a server without a country is a server the
 * audience it was built for cannot narrow down to. The empty option stays in the list so the
 * browser can block the submit itself instead of waiting for the server to answer.
 */
export function ServerCountrySelect({ id, defaultValue, meta, error, onValueChange }: ServerCountrySelectProps) {
  return (
    <Field>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>País<span aria-hidden="true" className="text-primary">*</span></FieldLabel>
        {meta ? <span className="shrink-0 text-xs font-medium text-muted-foreground">{meta}</span> : null}
      </div>
      <NativeSelect id={id} name="country" size="lg" defaultValue={defaultValue ?? ""} required aria-invalid={Boolean(error)} onChange={(event) => onValueChange?.(event.target.value)} className="w-full">
        <option value="">Elige un país</option>
        {serverCountries.map((country) => (
          <option key={country.code} value={country.code}>{country.flag} {country.label}</option>
        ))}
      </NativeSelect>
      <FieldDescription>El país de la comunidad, no el del servidor físico.</FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
