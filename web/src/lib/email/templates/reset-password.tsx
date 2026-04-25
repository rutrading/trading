import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

type Props = {
  userEmail?: string;
  resetLink?: string;
};

export const ResetPasswordEmail = ({
  userEmail = "user@example.com",
  resetLink = "https://example.com/reset-password?token=example",
}: Props) => {
  return (
    <Html>
      <Head />
      <Preview>Reset your R U Trading password</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white px-2 font-sans">
          <Container className="mx-auto my-[40px] max-w-[465px] rounded p-[20px]">
            <Heading className="my-6 text-center font-medium text-2xl text-black">
              Reset your password
            </Heading>

            <Text className="text-center text-[#737373] text-base leading-relaxed">
              We received a request to reset the password for your R U Trading
              account. Click the button below to choose a new password.
            </Text>

            <Section className="my-8 text-center">
              <Button
                href={resetLink}
                className="rounded-lg bg-black px-6 py-3 font-semibold text-sm text-white"
              >
                Reset Password
              </Button>
            </Section>

            <Hr className="mx-0 mt-[26px] w-full border border-[#eaeaea] border-solid" />
            <Text className="text-[#666666] text-[12px] leading-[24px]">
              This email was intended for{" "}
              <span className="text-black">{userEmail}</span>. If you didn't
              request this, you can safely ignore it. This link will expire in
              1 hour.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};

export default ResetPasswordEmail;
