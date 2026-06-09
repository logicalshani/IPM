import { redirect } from "next/navigation";

type UnknownRoutePageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function UnknownRoutePage({ searchParams = {} }: UnknownRoutePageProps) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry));
    } else if (value) {
      params.set(key, value);
    }
  }

  const suffix = params.toString();
  redirect(suffix ? `/platform?${suffix}` : "/platform");
}
