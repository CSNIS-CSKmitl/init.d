<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from '$lib/toast';
	import type { LeaseInstance } from '$lib/types';
	import * as Field from '$lib/components/ui/field';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Button } from '$lib/components/ui/button';

	let { item, userId, form }: {
		item: LeaseInstance;
		userId: string;
		form?: { id?: string; ownerError?: string; ownerEmails?: string } | null;
	} = $props();

	let saving = $state(false);
</script>

<section class="flex flex-col gap-2 border-t border-border pt-4">
	<h3 class="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Owners</h3>
	<p class="break-all text-xs text-foreground/80">
		{item.requester_email ?? item.expand?.email?.email ?? 'Requester'}
		{#each item.owner_emails ?? [] as email (email)}
			· {email}
		{/each}
	</p>
	{#if item.email === userId}
		<form
			method="POST"
			action="?/owners"
			use:enhance={() => {
				saving = true;
				return async ({ result, update }) => {
					try {
						if (result.type === 'redirect' || result.type === 'success') {
							toast.success('บันทึกผู้ดูแลร่วมเรียบร้อยแล้ว');
						} else if (result.type === 'failure') {
							const err = (result.data as { ownerError?: string } | undefined)?.ownerError;
							toast.error(err || 'ไม่สามารถบันทึกผู้ดูแลร่วมได้');
						} else if (result.type === 'error') {
							toast.error('ไม่สามารถบันทึกผู้ดูแลร่วมได้');
						}
						await update();
					} finally {
						saving = false;
					}
				};
			}}
			class="flex flex-col gap-2"
		>
			<input type="hidden" name="id" value={item.id} />
			<Field.Field data-invalid={form?.id === item.id && !!form?.ownerError}>
				<Field.FieldLabel for="owners-{item.id}">Co-owner emails</Field.FieldLabel>
				<Textarea id="owners-{item.id}" name="owner_emails" rows={2}
					value={form?.id === item.id && form.ownerEmails != null ? form.ownerEmails : (item.owner_emails ?? []).join(', ')}
					aria-invalid={form?.id === item.id && !!form?.ownerError}
					placeholder="name@example.com, teammate@example.com" />
				<Field.FieldDescription>Separate emails with commas. Everyone listed can access this VM/CT.</Field.FieldDescription>
				{#if form?.id === item.id && form?.ownerError}
					<Field.FieldError>{form.ownerError}</Field.FieldError>
				{/if}
			</Field.Field>
			<Button type="submit" variant="outline" size="sm" disabled={saving} class="self-start">
				{saving ? 'Saving…' : 'Save owners'}
			</Button>
		</form>
	{/if}
</section>
