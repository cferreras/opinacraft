import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { serverCountries } from "@/lib/servers/countries";

type ServerCountrySelectProps = {
  id: string;
  defaultValue?: string | null;
  meta?: React.ReactNode;
};

/** Where the community plays from, not where the machine is hosted — see `countries.ts`. */
export function ServerCountrySelect({ id, defaultValue, meta }: ServerCountrySelectProps) {
  return (
    <Field>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>País</FieldLabel>
        {meta ?? <span className="shrink-0 text-xs font-medium text-muted-foreground">Opcional</span>}
      </div>
      <NativeSelect id={id} name="country" size="lg" defaultValue={defaultValue ?? ""} className="w-full">
        <option value="">Sin especificar</option>
        {serverCountries.map((country) => (
          <option key={country.code} value={country.code}>{country.flag} {country.label}</option>
        ))}
      </NativeSelect>
      <FieldDescription>El país de la comunidad, no el del servidor físico.</FieldDescription>
    </Field>
  );
}
