const BASE_URL = `http://127.0.0.1:${process.env.DESKTOP_AUTOMATION_PORT || 9223}`;

export async function automationFetch<T = unknown>(
	path: string,
	options?: RequestInit,
): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
	});
	if (!res.ok) {
		throw new Error(
			`Automation server error: ${res.status} ${await res.text()}`,
		);
	}
	return res.json() as Promise<T>;
}
